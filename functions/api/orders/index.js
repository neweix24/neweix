import { verifyAdmin, unauthorized } from "../../_lib/auth.js";
import { checkOtp } from "../../_lib/otp.js";

const DELIVERY = { dhaka: 80, other: 130 }; // ডেলিভারি চার্জ এখানে বদলান
const err = (m, s = 400) => Response.json({ error: m }, { status: s });

// পাবলিক: গ্রাহকের অর্ডার। দাম সবসময় সার্ভারের ডাটাবেস থেকে নেওয়া হয়।
export async function onRequestPost({ request, env }) {
  try {
    const b = await request.json();
    const name = String(b.name ?? "").trim();
    const phone = String(b.phone ?? "").trim();
    const address = String(b.address ?? "").trim();
    const area = b.area === "dhaka" ? "dhaka" : "other";

    if (name.length < 2 || name.length > 100) return err("সঠিক নাম দিন");
    if (!/^01[3-9]\d{8}$/.test(phone)) return err("সঠিক মোবাইল নম্বর দিন (01XXXXXXXXX)");
    if (address.length < 10 || address.length > 300) return err("সম্পূর্ণ ঠিকানা দিন");

    const otpErr = await checkOtp(env, phone, String(b.otp ?? ""));
    if (otpErr) return err(otpErr);

    const reqItems = Array.isArray(b.items) ? b.items.slice(0, 30) : [];
    if (!reqItems.length) return err("কার্ট খালি");

    const items = [];
    let subtotal = 0;
    for (const r of reqItems) {
      const id = Number(r.id), qty = Number(r.qty);
      if (!Number.isInteger(id) || !Number.isInteger(qty) || qty < 1 || qty > 20)
        return err("পণ্যের তথ্য সঠিক নয়");
      const p = await env.DB.prepare(
        "SELECT id, name, price, stock FROM products WHERE id = ?").bind(id).first();
      if (!p) return err("একটি পণ্য আর পাওয়া যায় না");
      if (p.stock < qty) return err(`"${p.name}" এর স্টক আছে মাত্র ${p.stock}টি`);
      items.push({ id, name: p.name, price: p.price, qty });
      subtotal += p.price * qty;
    }

    // স্টক কমানো (শর্তসহ), ব্যর্থ হলে আগেরগুলো ফেরত
    const done = [];
    for (const i of items) {
      const u = await env.DB.prepare(
        "UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?"
      ).bind(i.qty, i.id, i.qty).run();
      if (!u.meta?.changes) {
        for (const d of done)
          await env.DB.prepare("UPDATE products SET stock = stock + ? WHERE id = ?").bind(d.qty, d.id).run();
        return err("স্টক শেষ হয়ে গেছে, কার্ট পরীক্ষা করুন");
      }
      done.push(i);
    }

    const delivery = DELIVERY[area];
    const total = subtotal + delivery;
    const r = await env.DB.prepare(
      `INSERT INTO orders (customer_name, phone, address, items, total_amount, delivery_charge)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(name, phone, address, JSON.stringify(items), total, delivery).run();

    await env.DB.prepare("DELETE FROM otp_codes WHERE phone = ?").bind(phone).run(); // OTP একবারই ব্যবহার
    return Response.json({ success: true, order_id: r.meta.last_row_id, total });
  } catch {
    return err("অর্ডার করা যায়নি, আবার চেষ্টা করুন", 500);
  }
}

// শুধু অ্যাডমিন: অর্ডার তালিকা
export async function onRequestGet({ request, env }) {
  if (!(await verifyAdmin(request, env))) return unauthorized();
  const { results } = await env.DB.prepare(
    "SELECT * FROM orders ORDER BY id DESC LIMIT 200").all();
  return Response.json({ success: true, orders: results || [] });
}
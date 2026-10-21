import { verifyAdmin, unauthorized } from "../../_lib/auth.js";

const err = (m, s = 400) => Response.json({ error: m }, { status: s });

// শুধু অ্যাডমিন: একটি অর্ডার Pathao-তে বুক করে
export async function onRequestPost({ request, env }) {
  if (!(await verifyAdmin(request, env))) return unauthorized();

  const need = ["PATHAO_CLIENT_ID", "PATHAO_CLIENT_SECRET", "PATHAO_USERNAME", "PATHAO_PASSWORD", "PATHAO_STORE_ID"];
  if (need.some(k => !env[k])) return err("Pathao সেটআপ অসম্পূর্ণ", 500);

  try {
    const { order_id } = await request.json();
    const o = await env.DB.prepare("SELECT * FROM orders WHERE id = ?").bind(Number(order_id)).first();
    if (!o) return err("অর্ডার পাওয়া যায়নি", 404);
    if (o.courier_tracking_id) return err("এই অর্ডার আগেই কুরিয়ারে পাঠানো হয়েছে");
    if (o.order_status === "Cancelled") return err("বাতিল অর্ডার পাঠানো যাবে না");

    const base = env.PATHAO_BASE_URL || "https://courier-api.pathao.com";
    const tr = await fetch(base + "/aladdin/api/v1/issue-token", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        client_id: env.PATHAO_CLIENT_ID, client_secret: env.PATHAO_CLIENT_SECRET,
        username: env.PATHAO_USERNAME, password: env.PATHAO_PASSWORD, grant_type: "password"
      })
    });
    const t = await tr.json().catch(() => ({}));
    if (!t.access_token) return err("Pathao লগইন ব্যর্থ — কী ও পাসওয়ার্ড পরীক্ষা করুন", 502);

    let items = [];
    try { items = JSON.parse(o.items); } catch {}
    const body = {
      store_id: Number(env.PATHAO_STORE_ID),
      merchant_order_id: String(o.id),
      recipient_name: o.customer_name,
      recipient_phone: o.phone,
      recipient_address: o.address,
      delivery_type: 48,          // নরমাল ডেলিভারি
      item_type: 2,               // পার্সেল
      item_quantity: items.reduce((s, i) => s + i.qty, 0) || 1,
      item_weight: 0.5,           // কেজি; দরকারে বদলান
      item_description: items.map(i => `${i.name} x${i.qty}`).join(", ").slice(0, 200),
      amount_to_collect: o.payment_status === "Paid" ? 0 : Math.round(o.total_amount)
    };
    const r = await fetch(base + "/aladdin/api/v1/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: "Bearer " + t.access_token },
      body: JSON.stringify(body)
    });
    const d = await r.json().catch(() => ({}));
    const cid = d?.data?.consignment_id;
    if (!r.ok || !cid) return err("Pathao: " + (d.message || "অর্ডার তৈরি হয়নি"), 502);

    await env.DB.prepare(
      "UPDATE orders SET courier_tracking_id = ?, order_status = 'Shipped' WHERE id = ?").bind(cid, o.id).run();
    return Response.json({ success: true, consignment_id: cid });
  } catch {
    return err("কুরিয়ারে পাঠানো যায়নি", 500);
  }
}
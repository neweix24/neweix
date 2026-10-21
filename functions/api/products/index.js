import { verifyAdmin, unauthorized } from "../../_lib/auth.js";
import { parseProduct } from "../../_lib/product.js";

export async function onRequestGet({ env }) {
  try {
    const { results } = await env.DB.prepare(
      `SELECT id, name, description, price, image_url, category, stock, created_at
       FROM products ORDER BY id DESC LIMIT 500`
    ).all();
    return Response.json({ success: true, products: results || [] });
  } catch {
    return Response.json({ error: "পণ্য লোড করা যায়নি" }, { status: 500 });
  }
}

export async function onRequestPost({ request, env }) {
  if (!(await verifyAdmin(request, env))) return unauthorized();

  try {
    const { value, error } = parseProduct(await request.json());
    if (error) return Response.json({ error }, { status: 400 });

    const r = await env.DB.prepare(
      `INSERT INTO products (name, description, price, image_url, category, stock)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(value.name, value.description, value.price,
           value.image_url, value.category, value.stock).run();

    return Response.json({
      success: true, message: "পণ্য সফলভাবে যোগ হয়েছে", id: r.meta.last_row_id
    });
  } catch {
    return Response.json(
      { error: "পণ্য যোগ করা যায়নি। তথ্য আবার পরীক্ষা করুন।" }, { status: 500 }
    );
  }
}
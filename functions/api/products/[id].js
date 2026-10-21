import { verifyAdmin, unauthorized } from "../../_lib/auth.js";
import { parseProduct } from "../../_lib/product.js";

function getId(params) {
  const id = Number(params.id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function onRequestPut({ request, env, params }) {
  if (!(await verifyAdmin(request, env))) return unauthorized();

  const id = getId(params);
  if (!id) return Response.json({ error: "পণ্যের ID সঠিক নয়" }, { status: 400 });

  try {
    const { value, error } = parseProduct(await request.json());
    if (error) return Response.json({ error }, { status: 400 });

    const r = await env.DB.prepare(
      `UPDATE products
       SET name = ?, description = ?, price = ?, image_url = ?, category = ?, stock = ?
       WHERE id = ?`
    ).bind(value.name, value.description, value.price,
           value.image_url, value.category, value.stock, id).run();

    if (!r.meta?.changes) {
      return Response.json({ error: "পণ্য পাওয়া যায়নি" }, { status: 404 });
    }
    return Response.json({ success: true, message: "পণ্য সম্পাদনা সফল হয়েছে" });
  } catch {
    return Response.json({ error: "পণ্য সম্পাদনা করা যায়নি" }, { status: 500 });
  }
}

export async function onRequestDelete({ request, env, params }) {
  if (!(await verifyAdmin(request, env))) return unauthorized();

  const id = getId(params);
  if (!id) return Response.json({ error: "পণ্যের ID সঠিক নয়" }, { status: 400 });

  try {
    const r = await env.DB.prepare("DELETE FROM products WHERE id = ?").bind(id).run();
    if (!r.meta?.changes) {
      return Response.json({ error: "পণ্য পাওয়া যায়নি" }, { status: 404 });
    }
    return Response.json({ success: true, message: "পণ্য মুছে ফেলা হয়েছে" });
  } catch {
    return Response.json({ error: "পণ্য মুছতে সমস্যা হয়েছে" }, { status: 500 });
  }
}
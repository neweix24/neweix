import { verifyAdmin, unauthorized } from "../../_lib/auth.js";

const OS = ["Pending", "Confirmed", "Shipped", "Delivered", "Cancelled"];
const PS = ["Pending", "Paid"];

export async function onRequestPut({ request, env, params }) {
  if (!(await verifyAdmin(request, env))) return unauthorized();
  const id = Number(params.id);
  if (!Number.isInteger(id) || id < 1) return Response.json({ error: "ID সঠিক নয়" }, { status: 400 });
  try {
    const b = await request.json();
    if (!OS.includes(b.order_status) || !PS.includes(b.payment_status))
      return Response.json({ error: "স্ট্যাটাস সঠিক নয়" }, { status: 400 });
    const track = String(b.courier_tracking_id ?? "").trim().slice(0, 100);
    const r = await env.DB.prepare(
      "UPDATE orders SET order_status = ?, payment_status = ?, courier_tracking_id = ? WHERE id = ?"
    ).bind(b.order_status, b.payment_status, track, id).run();
    if (!r.meta?.changes) return Response.json({ error: "অর্ডার পাওয়া যায়নি" }, { status: 404 });
    return Response.json({ success: true });
  } catch {
    return Response.json({ error: "আপডেট করা যায়নি" }, { status: 500 });
  }
}
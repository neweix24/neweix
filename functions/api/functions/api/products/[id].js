export async function onRequest(context) {
  const { request, env, params } = context;
  const id = params.id;

  if (request.method === "GET") {
    const product = await env.DB.prepare(
      "SELECT * FROM products WHERE id = ?"
    ).bind(id).first();

    if (!product) {
      return Response.json({ error: "Product not found" }, { status: 404 });
    }

    return Response.json(product);
  }

  return Response.json(
    { error: "Method not allowed" },
    {
      status: 405,
      headers: { Allow: "GET" }
    }
  );
}
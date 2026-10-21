async function verifyAdmin(request, env) {
  try {
    const cookie = request.headers.get("Cookie") || "";
    const match = cookie.match(/(?:^|;\s*)neweix_admin=([^;]+)/);

    if (!match || !env.SESSION_SECRET || !env.ADMIN_USERNAME) {
      return false;
    }

    const parts = match[1].split(".");
    if (parts.length !== 2) return false;

    const payload = parts[0];
    const signature = Uint8Array.from(
      atob(parts[1]),
      c => c.charCodeAt(0)
    );

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(env.SESSION_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    if (!await crypto.subtle.verify(
      "HMAC",
      key,
      signature,
      new TextEncoder().encode(payload)
    )) return false;

    const session = JSON.parse(atob(payload));

    return session.username === env.ADMIN_USERNAME &&
      Number.isFinite(session.expires) &&
      session.expires > Date.now();
  } catch {
    return false;
  }
}

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" }
  });
}

function getId(params) {
  const id = Number(params.id);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function onRequestGet({ env, params }) {
  const id = getId(params);
  if (!id) return json({ error: "ভুল পণ্য ID" }, 400);

  try {
    const product = await env.DB.prepare(
      "SELECT id, name, description, price, image_url, category, stock, created_at FROM products WHERE id = ?"
    ).bind(id).first();

    if (!product) return json({ error: "পণ্য পাওয়া যায়নি" }, 404);

    return json({ success: true, product });
  } catch {
    return json({ error: "পণ্য লোড করা যায়নি" }, 500);
  }
}

export async function onRequestPut({ request, env, params }) {
  if (!await verifyAdmin(request, env)) {
    return json({ error: "অনুমতি নেই। আবার Admin Login করুন।" }, 401);
  }

  const id = getId(params);
  if (!id) return json({ error: "ভুল পণ্য ID" }, 400);

  try {
    const data = await request.json();

    const name = typeof data.name === "string" ? data.name.trim() : "";
    const description = typeof data.description === "string" ? data.description.trim() : "";
    const category = typeof data.category === "string" ? data.category.trim() : "";
    const image_url = typeof data.image_url === "string" ? data.image_url.trim() : "";
    const price = Number(data.price);
    const stock = Number(data.stock);

    if (!name || name.length > 200) {
      return json({ error: "সঠিক পণ্যের নাম দিন" }, 400);
    }

    if (data.price === "" || data.price == null ||
        !Number.isFinite(price) || price < 0) {
      return json({ error: "সঠিক দাম দিন" }, 400);
    }

    if (data.stock === "" || data.stock == null ||
        !Number.isSafeInteger(stock) || stock < 0) {
      return json({ error: "সঠিক স্টকের সংখ্যা দিন" }, 400);
    }

    if (image_url) {
      try {
        if (new URL(image_url).protocol !== "https:") {
          return json({ error: "ছবির HTTPS লিংক দিন" }, 400);
        }
      } catch {
        return json({ error: "ছবির লিংক সঠিক নয়" }, 400);
      }
    }

    const result = await env.DB.prepare(
      `UPDATE products
       SET name = ?, description = ?, price = ?,
           image_url = ?, category = ?, stock = ?
       WHERE id = ?`
    ).bind(
      name, description, price, image_url || null,
      category, stock, id
    ).run();

    if (!result.meta.changes) {
      return json({ error: "পণ্য পাওয়া যায়নি" }, 404);
    }

    return json({ success: true, message: "পণ্য আপডেট হয়েছে" });
  } catch {
    return json({ error: "পণ্য আপডেট করা যায়নি" }, 500);
  }
}

export async function onRequestDelete({ request, env, params }) {
  if (!await verifyAdmin(request, env)) {
    return json({ error: "অনুমতি নেই। আবার Admin Login করুন।" }, 401);
  }

  const id = getId(params);
  if (!id) return json({ error: "ভুল পণ্য ID" }, 400);

  try {
    const result = await env.DB.prepare(
      "DELETE FROM products WHERE id = ?"
    ).bind(id).run();

    if (!result.meta.changes) {
      return json({ error: "পণ্য পাওয়া যায়নি" }, 404);
    }

    return json({ success: true, message: "পণ্য ডিলিট হয়েছে" });
  } catch {
    return json({ error: "পণ্য ডিলিট করা যায়নি" }, 500);
  }
}
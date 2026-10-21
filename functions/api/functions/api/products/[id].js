async function verifyAdmin(request, env) {
  try {
    const cookie = request.headers.get("Cookie") || "";
    const match = cookie.match(/(?:^|;\s*)neweix_admin=([^;]+)/);

    if (!match || !env.SESSION_SECRET) return false;

    const parts = match[1].split(".");
    if (parts.length !== 2) return false;

    const payload = parts[0];
    const signature = parts[1];

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(env.SESSION_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const signed = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(payload)
    );

    const expected = btoa(
      String.fromCharCode(...new Uint8Array(signed))
    ).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

    if (signature !== expected) return false;

    const session = JSON.parse(
      atob(payload.replace(/-/g, "+").replace(/_/g, "/"))
    );

    return !!session.username &&
      session.username === env.ADMIN_USERNAME &&
      session.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export async function onRequestPut({ request, env, params }) {
  try {
    if (!(await verifyAdmin(request, env))) {
      return Response.json(
        { error: "অনুমতি নেই। আবার Admin Login করুন।" },
        { status: 401 }
      );
    }

    const id = params.id;
    if (!id) {
      return Response.json({ error: "পণ্যের ID পাওয়া যায়নি" }, { status: 400 });
    }

    const body = await request.json();
    const name = String(body.name ?? "").trim();
    const price = Number(body.price);
    const description = String(body.description ?? "").trim();
    const image = String(body.image ?? "").trim();
    const category = String(body.category ?? "").trim();

    if (!name || !Number.isFinite(price) || price < 0) {
      return Response.json(
        { error: "পণ্যের নাম ও সঠিক দাম দিন" },
        { status: 400 }
      );
    }

    const result = await env.DB.prepare(
      `UPDATE products
       SET name = ?, price = ?, description = ?, image = ?, category = ?
       WHERE id = ?`
    ).bind(name, price, description, image, category, id).run();

    if (!result.meta?.changes) {
      return Response.json(
        { error: "পণ্য পাওয়া যায়নি অথবা কোনো পরিবর্তন হয়নি" },
        { status: 404 }
      );
    }

    return Response.json({ success: true, message: "পণ্য সম্পাদনা সফল হয়েছে" });
  } catch (error) {
    return Response.json(
      { error: "পণ্য সম্পাদনা করা যায়নি", detail: String(error.message || error) },
      { status: 500 }
    );
  }
}

export async function onRequestDelete({ request, env, params }) {
  try {
    if (!(await verifyAdmin(request, env))) {
      return Response.json(
        { error: "অনুমতি নেই। আবার Admin Login করুন।" },
        { status: 401 }
      );
    }

    const id = params.id;
    if (!id) {
      return Response.json({ error: "পণ্যের ID পাওয়া যায়নি" }, { status: 400 });
    }

    const result = await env.DB.prepare(
      "DELETE FROM products WHERE id = ?"
    ).bind(id).run();

    if (!result.meta?.changes) {
      return Response.json({ error: "পণ্য পাওয়া যায়নি" }, { status: 404 });
    }

    return Response.json({ success: true, message: "পণ্য মুছে ফেলা হয়েছে" });
  } catch (error) {
    return Response.json(
      { error: "পণ্য মুছতে সমস্যা হয়েছে", detail: String(error.message || error) },
      { status: 500 }
    );
  }
}
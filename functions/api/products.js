export async function onRequestGet({ env }) {
  try {
    const { results } = await env.DB.prepare(
      `SELECT id, name, description, price, image_url, category, stock, created_at
       FROM products ORDER BY id DESC`
    ).all();

    return Response.json({
      success: true,
      products: results || []
    });
  } catch {
    return Response.json(
      { error: "পণ্য লোড করা যায়নি" },
      { status: 500 }
    );
  }
}

async function verifyAdmin(request, env) {
  try {
    const cookie = request.headers.get("Cookie") || "";
    const match = cookie.match(/(?:^|;\s*)neweix_admin=([^;]+)/);

    if (!match || !env.SESSION_SECRET) return false;

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

    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      signature,
      new TextEncoder().encode(payload)
    );

    if (!valid) return false;

    const session = JSON.parse(atob(payload));
    return Boolean(
      session.username === env.ADMIN_USERNAME &&
      session.expires > Date.now()
    );
  } catch {
    return false;
  }
}

export async function onRequestPost({ request, env }) {
  if (!(await verifyAdmin(request, env))) {
    return Response.json(
      { error: "অনুমতি নেই। আবার Admin Login করুন।" },
      { status: 401 }
    );
  }

  try {
    const data = await request.json();

    const name = typeof data.name === "string"
      ? data.name.trim()
      : "";

    const description = typeof data.description === "string"
      ? data.description.trim()
      : "";

    const category = typeof data.category === "string"
      ? data.category.trim()
      : "";

    const image_url = typeof data.image_url === "string"
      ? data.image_url.trim()
      : "";

    const price = Number(data.price);
    const stock = Number(data.stock ?? 0);

    if (!name || name.length > 200) {
      return Response.json(
        { error: "সঠিক পণ্যের নাম লিখুন" },
        { status: 400 }
      );
    }

    if (
      data.price === "" ||
      data.price === null ||
      data.price === undefined ||
      !Number.isFinite(price) ||
      price < 0
    ) {
      return Response.json(
        { error: "সঠিক দাম লিখুন" },
        { status: 400 }
      );
    }

    if (
      !Number.isInteger(stock) ||
      stock < 0
    ) {
      return Response.json(
        { error: "সঠিক স্টকের সংখ্যা লিখুন" },
        { status: 400 }
      );
    }

    if (image_url) {
      try {
        if (new URL(image_url).protocol !== "https:") {
          throw new Error("HTTPS required");
        }
      } catch {
        return Response.json(
          { error: "ছবির সঠিক HTTPS লিংক দিন" },
          { status: 400 }
        );
      }
    }

    const result = await env.DB.prepare(
      `INSERT INTO products
       (name, description, price, image_url, category, stock)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(
      name,
      description,
      price,
      image_url || null,
      category,
      stock
    ).run();

    return Response.json({
      success: true,
      message: "পণ্য সফলভাবে যোগ হয়েছে",
      id: result.meta.last_row_id
    });
  } catch {
    return Response.json(
      { error: "পণ্য যোগ করা যায়নি। তথ্য আবার পরীক্ষা করুন।" },
      { status: 500 }
    );
  }
}
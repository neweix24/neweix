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

function json(data, status = 200) {
  return Response.json(data, { status });
}

function getProductId(params) {
  const id = String(params?.id ?? "");

  if (!/^[1-9]\d*$/.test(id)) return null;

  const number = Number(id);

  return Number.isSafeInteger(number) ? number : null;
}

export async function onRequestPut({ request, env, params }) {
  if (!(await verifyAdmin(request, env))) {
    return json({ error: "অনুমতি নেই। আবার Admin Login করুন।" }, 401);
  }

  const id = getProductId(params);

  if (id === null) {
    return json({ error: "পণ্যের ID সঠিক নয়।" }, 400);
  }

  try {
    const data = await request.json();

    const name = typeof data.name === "string"
      ? data.name.trim() : "";

    const description = typeof data.description === "string"
      ? data.description.trim() : "";

    const category = typeof data.category === "string"
      ? data.category.trim() : "";

    const image_url = typeof data.image_url === "string"
      ? data.image_url.trim() : "";

    const price = Number(data.price);
    const stock = Number(data.stock ?? 0);

    if (!name || name.length > 200) {
      return json({ error: "সঠিক পণ্যের নাম লিখুন।" }, 400);
    }

    if (
      data.price === "" ||
      data.price === null ||
      data.price === undefined ||
      !Number.isFinite(price) ||
      price < 0
    ) {
      return json({ error: "সঠিক দাম লিখুন।" }, 400);
    }

    if (!Number.isInteger(stock) || stock < 0) {
      return json({ error: "সঠিক স্টকের সংখ্যা লিখুন।" }, 400);
    }

    if (
      description.length > 10000 ||
      category.length > 100 ||
      image_url.length > 2048
    ) {
      return json({ error: "কোনো তথ্যের দৈর্ঘ্য বেশি হয়েছে।" }, 400);
    }

    if (image_url) {
      try {
        if (new URL(image_url).protocol !== "https:") {
          throw new Error("HTTPS required");
        }
      } catch {
        return json({ error: "ছবির সঠিক HTTPS লিংক দিন।" }, 400);
      }
    }

    const result = await env.DB.prepare(
      `UPDATE products
       SET name = ?, description = ?, price = ?,
           image_url = ?, category = ?, stock = ?
       WHERE id = ?`
    ).bind(
      name,
      description,
      price,
      image_url || null,
      category,
      stock,
      id
    ).run();

    if (!result.meta || result.meta.changes === 0) {
      return json({ error: "পণ্যটি পাওয়া যায়নি।" }, 404);
    }

    return json({
      success: true,
      message: "পণ্য সফলভাবে আপডেট হয়েছে।"
    });
  } catch {
    return json({ error: "পণ্য আপডেট করা যায়নি।" }, 500);
  }
}

export async function onRequestDelete({ request, env, params }) {
  if (!(await verifyAdmin(request, env))) {
    return json({ error: "অনুমতি নেই। আবার Admin Login করুন।" }, 401);
  }

  const id = getProductId(params);

  if (id === null) {
    return json({ error: "পণ্যের ID সঠিক নয়।" }, 400);
  }

  try {
    const result = await env.DB.prepare(
      "DELETE FROM products WHERE id = ?"
    ).bind(id).run();

    if (!result.meta || result.meta.changes === 0) {
      return json({ error: "পণ্যটি পাওয়া যায়নি।" }, 404);
    }

    return json({
      success: true,
      message: "পণ্য সফলভাবে ডিলিট হয়েছে।"
    });
  } catch {
    return json({ error: "পণ্য ডিলিট করা যায়নি।" }, 500);
  }
}
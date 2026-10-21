export function parseProduct(data) {
  data = data && typeof data === "object" ? data : {};
  const str = v => (typeof v === "string" ? v.trim() : "");

  const name = str(data.name);
  const description = str(data.description);
  const category = str(data.category);
  const image_url = str(data.image_url);
  const price = Number(data.price);
  const stock = Number(data.stock ?? 0);

  if (!name || name.length > 200) return { error: "সঠিক পণ্যের নাম লিখুন" };
  if (description.length > 10000) return { error: "বিবরণ অনেক বড়" };
  if (category.length > 100) return { error: "ক্যাটাগরির নাম অনেক বড়" };

  if (
    data.price === "" || data.price === null || data.price === undefined ||
    !Number.isFinite(price) || price < 0 || price > 10000000
  ) return { error: "সঠিক দাম লিখুন" };

  if (!Number.isInteger(stock) || stock < 0 || stock > 1000000)
    return { error: "সঠিক স্টকের সংখ্যা লিখুন" };

  if (image_url) {
    try {
      if (new URL(image_url).protocol !== "https:") throw new Error();
    } catch {
      return { error: "ছবির সঠিক HTTPS লিংক দিন" };
    }
  }

  return {
    value: { name, description, price, image_url: image_url || null, category, stock }
  };
}
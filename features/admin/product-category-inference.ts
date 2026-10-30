export type ProductCategoryOption = {
  id: string;
  name: string;
  slug: string;
};

type CategoryRule = {
  slug: string;
  terms: string[];
};

// Garment type comes first; gender, color, fabric and fit are product attributes.
const CATEGORY_RULES: CategoryRule[] = [
  {
    slug: "polo-shirts",
    terms: ["polo", "polo shirt", "polo t shirt", "polo t-shirt", "পোলো", "পোলো শার্ট"],
  },
  {
    slug: "jeans",
    terms: ["jeans", "jean", "denim pant", "denim pants", "ডেনিম প্যান্ট", "জিন্স"],
  },
  {
    slug: "t-shirts",
    terms: ["t-shirt", "t shirt", "tshirt", "t-shirts", "t shirts", "tee shirt", "tee shirts", "tee", "tees", "টি শার্ট", "টিশার্ট"],
  },
  {
    slug: "panjabi",
    terms: ["panjabi", "punjabi", "panjabi set", "kurta", "kurtas", "kabli", "kabli set", "fatua", "fotua", "fatuya", "katuya", "jubba", "jubbah", "পাঞ্জাবি", "পাঞ্জাবী", "কুর্তা", "কাবলি", "ফতুয়া", "ফতুয়া", "ফতুয়া", "কাটুয়া", "জুব্বা"],
  },
  {
    slug: "blazers-suits",
    terms: ["blazer", "blazers", "suit", "suits", "tuxedo", "waistcoat", "ব্লেজার", "স্যুট", "ওয়েস্টকোট", "ওয়েস্টকোট"],
  },
  {
    slug: "hoodies-sweatshirts",
    terms: ["hoodie", "hoodies", "hooded", "sweatshirt", "sweatshirts", "sweat shirt", "crewneck", "হুডি", "হুডিস", "সোয়েটশার্ট", "সোয়েটশার্ট"],
  },
  {
    slug: "sweaters",
    terms: ["sweater", "sweaters", "cardigan", "cardigans", "jumper", "jumpers", "pullover", "knitwear", "সোয়েটার", "সোয়েটার", "কার্ডিগান"],
  },
  {
    slug: "jackets",
    terms: ["jacket", "jackets", "coat", "coats", "bomber", "windbreaker", "puffer", "varsity", "parka", "trench coat", "জ্যাকেট", "কোট"],
  },
  {
    slug: "shorts",
    terms: ["shorts", "short pant", "short pants", "bermuda", "bermudas", "gym short", "gym shorts", "cargo shorts", "denim shorts", "শর্টস", "হাফ প্যান্ট", "বারমুডা"],
  },
  {
    slug: "pajamas",
    terms: ["pajama", "pajamas", "pyjama", "pyjamas", "nightwear", "sleepwear", "পাজামা", "পায়জামা", "পায়জামা", "নাইট ড্রেস"],
  },
  {
    slug: "sportswear",
    terms: ["sportswear", "activewear", "tracksuit", "track suit", "sports jersey", "football jersey", "cricket jersey", "gym wear", "জার্সি", "ট্র্যাকস্যুট", "স্পোর্টসওয়্যার", "স্পোর্টসওয়্যার"],
  },
  {
    slug: "underwear",
    terms: ["underwear", "undergarment", "boxer", "boxers", "brief", "briefs", "trunks", "lingerie", "bra", "panty", "panties", "innerwear", "অন্তর্বাস", "বক্সার", "ব্রিফ", "প্যান্টি", "ব্রা"],
  },
  {
    slug: "footwear",
    terms: ["shoe", "shoes", "sneaker", "sneakers", "sandal", "sandals", "slipper", "slippers", "boots", "loafers", "জুতা", "স্নিকার্স", "স্যান্ডেল", "স্লিপার", "বুট"],
  },
  {
    slug: "fashion-accessories",
    terms: ["accessory", "accessories", "cap", "caps", "hat", "hats", "belt", "wallet", "wallets", "bag", "bags", "tie", "ties", "socks", "scarf", "scarves", "sunglasses", "watch", "টুপি", "ক্যাপ", "বেল্ট", "ওয়ালেট", "ওয়ালেট", "ব্যাগ", "টাই", "মোজা", "স্কার্ফ", "ঘড়ি", "ঘড়ি"],
  },
  {
    slug: "pants",
    terms: ["pant", "pants", "trouser", "trousers", "chino", "chinos", "cargo pant", "cargo pants", "jogger", "joggers", "track pant", "track pants", "legging", "leggings", "palazzo", "gabardine", "ট্রাউজার", "প্যান্ট", "জগার", "চিনো", "কার্গো প্যান্ট", "লেগিংস"],
  },
  {
    slug: "shirts",
    terms: ["shirt", "shirts", "formal shirt", "casual shirt", "check shirt", "checked shirt", "oxford shirt", "button down", "button-down", "overshirt", "blouse", "শার্ট", "ক্যাজুয়াল শার্ট", "ফরমাল শার্ট"],
  },
  {
    slug: "traditional-wear",
    terms: ["saree", "sari", "three piece", "3 piece", "three-piece", "salwar kameez", "kameez", "kurti", "abaya", "jilbab", "kaftan", "lehenga", "ghagra", "frock", "gown", "dress", "skirt", "tunic", "co ord set", "co-ord set", "শাড়ি", "শাড়ি", "থ্রি পিস", "কামিজ", "কুর্তি", "আবায়া", "কাফতান", "লেহেঙ্গা", "ফ্রক", "গাউন", "স্কার্ট"],
  },
];

function normalize(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[‐‑‒–—]/g, "-")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function containsTerm(normalizedName: string, term: string): boolean {
  const normalizedTerm = normalize(term);
  return normalizedTerm.length > 0 && ` ${normalizedName} `.includes(` ${normalizedTerm} `);
}

/**
 * Infers one active NEWEIX category from a product title.
 * Returns null when the title does not contain a reliable garment/product-type clue.
 */
export function inferProductCategory(
  productName: string,
  categories: ProductCategoryOption[],
): ProductCategoryOption | null {
  const normalizedName = normalize(productName);
  if (!normalizedName) return null;

  for (const rule of CATEGORY_RULES) {
    if (!rule.terms.some((term) => containsTerm(normalizedName, term))) continue;
    const category = categories.find((item) => item.slug === rule.slug);
    if (category) return category;
  }

  return null;
}

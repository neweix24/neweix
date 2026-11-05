export type SavedProductLists = { wishlist: string[]; compare: string[] };

const WISHLIST_KEY = "neweix_wishlist";
const COMPARE_KEY = "neweix_compare";

function readKey(key: string, limit: number): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(value)
      ? Array.from(new Set(value.filter((id): id is string => typeof id === "string" && id.length > 0))).slice(0, limit)
      : [];
  } catch {
    return [];
  }
}

export function readSavedProductLists(): SavedProductLists {
  return { wishlist: readKey(WISHLIST_KEY, 200), compare: readKey(COMPARE_KEY, 4) };
}

export function writeSavedProductLists(lists: SavedProductLists) {
  localStorage.setItem(WISHLIST_KEY, JSON.stringify(lists.wishlist.slice(-200)));
  localStorage.setItem(COMPARE_KEY, JSON.stringify(lists.compare.slice(0, 4)));
  window.dispatchEvent(new Event("neweix-wishlist-change"));
  window.dispatchEvent(new Event("neweix-compare-change"));
}

export async function mutateSavedProduct(listType: "wishlist" | "compare", productId: string, action: "add" | "remove") {
  try {
    const response = await fetch("/api/account/saved-products", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ list_type: listType, product_id: productId, action }),
    });
    if (response.status === 401) return { ok: true, guest: true };
    const result = await response.json().catch(() => null);
    return response.ok ? { ok: true, guest: false } : { ok: false, error: result?.error || "Could not sync saved products." };
  } catch {
    return { ok: false, error: "Could not sync saved products. Your browser list is still available." };
  }
}

export async function loadSavedProductLists(): Promise<SavedProductLists> {
  const local = readSavedProductLists();
  try {
    const response = await fetch("/api/account/saved-products", { cache: "no-store", credentials: "same-origin" });
    if (!response.ok) return local;
    const remote = (await response.json()) as Partial<SavedProductLists>;
    const remoteWishlist = Array.isArray(remote.wishlist) ? remote.wishlist.filter((id): id is string => typeof id === "string") : [];
    const remoteCompare = Array.isArray(remote.compare) ? remote.compare.filter((id): id is string => typeof id === "string") : [];
    const merged: SavedProductLists = {
      wishlist: Array.from(new Set([...remoteWishlist, ...local.wishlist])).slice(-200),
      compare: Array.from(new Set([...remoteCompare, ...local.compare])).slice(0, 4),
    };
    writeSavedProductLists(merged);
    for (const id of local.wishlist) if (!remoteWishlist.includes(id)) void mutateSavedProduct("wishlist", id, "add");
    for (const id of local.compare) if (!remoteCompare.includes(id)) void mutateSavedProduct("compare", id, "add");
    return merged;
  } catch {
    return local;
  }
}

export type StaffRole = "staff" | "admin" | "supreme";

export type StaffPermission =
  | "products.read"
  | "products.write"
  | "orders.read"
  | "orders.update"
  | "customers.read"
  | "settings.write"
  | "staff.manage"
  | "audit.read";

/** নিরাপদ ডিফল্ট: অনুমতি যাচাই তৈরি না হওয়া পর্যন্ত সব অনুমতি বন্ধ। */
export function hasPermission(
  _role: StaffRole | null,
  _permission: StaffPermission
): boolean {
  return false;
}
export type StaffRole =
  | "supreme"
  | "admin"
  | "manager"
  | "employee"
  | "staff"; // Legacy role; treated as Employee until old records are migrated.

export type StaffPermission =
  | "products.read"
  | "products.write"
  | "orders.read"
  | "orders.update"
  | "customers.read"
  | "settings.write"
  | "staff.employee.manage"
  | "staff.manager.propose"
  | "staff.manager.approve"
  | "staff.read"
  | "tasks.read"
  | "tasks.update"
  | "attendance.self"
  | "attendance.department.read"
  | "attendance.department.review"
  | "payroll.read"
  | "payroll.manage"
  | "finance.read"
  | "finance.manage"
  | "reports.department"
  | "reports.business"
  | "audit.read";

const ROLE_PERMISSIONS: Record<StaffRole, ReadonlySet<StaffPermission>> = {
  supreme: new Set<StaffPermission>([
    "products.read", "products.write",
    "orders.read", "orders.update", "customers.read", "settings.write",
    "staff.employee.manage", "staff.manager.propose", "staff.manager.approve",
    "staff.read", "tasks.read", "tasks.update",
    "attendance.self", "attendance.department.read", "attendance.department.review",
    "payroll.read", "payroll.manage", "finance.read", "finance.manage",
    "reports.department", "reports.business", "audit.read",
  ]),
  admin: new Set<StaffPermission>([
    "products.read", "products.write",
    "orders.read", "orders.update", "customers.read", "settings.write",
    "staff.employee.manage", "staff.manager.propose", "staff.read",
    "tasks.read", "tasks.update",
    "attendance.self", "attendance.department.read", "attendance.department.review",
    "payroll.read", "payroll.manage", "finance.read", "finance.manage",
    "reports.department", "reports.business",
  ]),
  manager: new Set<StaffPermission>([
    "products.read", "orders.read", "orders.update",
    "staff.read", "tasks.read", "tasks.update",
    "attendance.self", "attendance.department.read", "attendance.department.review",
    "finance.read", "reports.department",
  ]),
  employee: new Set<StaffPermission>([
    "tasks.read", "tasks.update", "attendance.self",
  ]),
  staff: new Set<StaffPermission>([
    "tasks.read", "tasks.update", "attendance.self",
  ]),
};

/** Deny by default. Sensitive actions must also be authorized by the server/API. */
export function hasPermission(
  role: StaffRole | null | undefined,
  permission: StaffPermission
): boolean {
  if (!role || !(role in ROLE_PERMISSIONS)) return false;
  return ROLE_PERMISSIONS[role].has(permission);
}

import { redirect } from "next/navigation";

// Guest order lookup (order number + phone) is the supported flow.
export default function OrdersPage() {
  redirect("/track-order");
}

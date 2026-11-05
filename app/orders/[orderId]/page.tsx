import CustomerOrderDetail from "@/features/orders/customer-order-detail";

export const dynamic = "force-dynamic";

export default async function CustomerOrderDetailPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  return <CustomerOrderDetail orderId={orderId} />;
}

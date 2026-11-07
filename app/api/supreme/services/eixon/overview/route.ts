import { proxySupremeService } from "@/lib/supreme-service-proxy";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  return proxySupremeService("eixon", "overview");
}

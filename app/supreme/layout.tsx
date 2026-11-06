import type { Metadata } from "next";
import { requireStaff } from "@/lib/auth";
import ServiceWorkerRegister from "./ServiceWorkerRegister";
import SupremeWorkspaceNavigation from "@/features/supreme/supreme-workspace-navigation";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Supreme Control",
  description: "Secure NEWEIX Supreme business control workspace.",
  manifest: `${process.env.SUPREME_PRIVATE_PATH || "/supreme"}/manifest.webmanifest`,
};

export default async function SupremeLayout({ children }: { children: React.ReactNode }) {
  await requireStaff(["supreme"]);

  return (
    <div className="premium-supreme-workspace min-h-screen" style={{ background: "var(--bg)", color: "var(--ink)" }}>
      <ServiceWorkerRegister />
      <SupremeWorkspaceNavigation />
      <div className="pb-24 sm:pb-28">{children}</div>
    </div>
  );
}

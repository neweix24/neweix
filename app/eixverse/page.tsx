import EixVerseHub from "@/features/eixverse/eixverse-hub";

export const dynamic = "force-dynamic";

// EixVerse is protected by the same middleware customer-session and
// verified-phone checks as the rest of the customer account area.
export default function EixVersePage() {
  return <EixVerseHub />;
}

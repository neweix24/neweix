import InfoPage from "@/features/content/info-page";
import { infoPages } from "@/features/content/info-page-data";

export default function FaqPage() {
  return <InfoPage data={infoPages.faq} />;
}

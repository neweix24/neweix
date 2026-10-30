import InfoPage from "@/features/content/info-page";
import { infoPages } from "@/features/content/info-page-data";

export default function PrivacyPage() {
  return <InfoPage data={infoPages.privacy} />;
}

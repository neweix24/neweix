import InfoPage from "@/features/content/info-page";
import { infoPages } from "@/features/content/info-page-data";

export default function AboutPage() {
  return <InfoPage data={infoPages.about} />;
}

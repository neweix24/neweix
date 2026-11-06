import Link from "next/link";
import Icon from "@/components/ui/icon";
import { useLanguage } from "@/components/language-provider";
import styles from "./homepage-search.module.css";

export default function HomepageSearch() {
  const { locale, t } = useLanguage();

  return (
    <Link
      href="/search"
      className={styles.searchForm}
      aria-label={locale === "bn" ? "সার্চ পেইজে যান" : "Go to search page"}
    >
      <span className={styles.searchIcon} aria-hidden="true"><Icon name="search" size={20} /></span>
      <span className={styles.searchPlaceholder}>
        {locale === "bn" ? "পণ্য, ব্র্যান্ড বা ক্যাটাগরি খুঁজুন..." : "Search products, brands or categories..."}
      </span>
      <span className={styles.submitButton}>
        <span>{locale === "bn" ? "খুঁজুন" : "Search"}</span>
        <Icon name="arrow-right" size={17} />
      </span>
    </Link>
  );
}

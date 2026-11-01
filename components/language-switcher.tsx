"use client";

import { useLanguage } from "@/components/language-provider";

export default function LanguageSwitcher() {
  const { locale, setLocale, t } = useLanguage();
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12 }}>
      <span>{t("language")}</span>
      <select
        aria-label={t("language")}
        value={locale}
        onChange={(event) => setLocale(event.target.value === "bn" ? "bn" : "en")}
        style={{ border: "1px solid var(--page-border, var(--border))", borderRadius: 8, padding: "6px 8px", background: "var(--page-panel, var(--surface))", color: "inherit" }}
      >
        <option value="en">English</option>
        <option value="bn">বাংলা</option>
      </select>
    </label>
  );
}

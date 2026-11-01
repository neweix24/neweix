"use client";

import LanguageSwitcher from "@/components/language-switcher";

export default function GlobalLanguageControl() {
  return (
    <div style={{
      position: "fixed",
      zIndex: 1000,
      top: 10,
      right: 10,
      padding: "5px 9px",
      border: "1px solid var(--page-border, var(--border, #d8ded9))",
      borderRadius: 999,
      background: "var(--page-panel, var(--surface, #ffffff))",
      color: "var(--page-text, var(--ink, #17211a))",
      boxShadow: "0 4px 18px rgba(0,0,0,.10)",
    }}>
      <LanguageSwitcher />
    </div>
  );
}

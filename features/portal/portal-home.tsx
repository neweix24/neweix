import Link from "next/link";
import { portalServices } from "./portal-data";
import styles from "./portal-home.module.css";

const iconGlyph: Record<(typeof portalServices)[number]["icon"], string> = {
  shop: "↗",
  package: "⌑",
  user: "◎",
  cart: "▱",
  shield: "◇",
  grid: "▦",
};

const accentClass = {
  lime: styles.iconLime,
  blue: styles.iconBlue,
  violet: styles.iconViolet,
  amber: styles.iconAmber,
};

export default function PortalHome() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.logo} aria-label="NEWEIX home">
          <span className={styles.logoMark}>N</span>
          <span>NEWEIX</span>
        </Link>
        <nav className={styles.headerLinks} aria-label="প্রধান নেভিগেশন">
          <Link href="/products">পণ্য</Link>
          <Link href="/track-order">অর্ডার ট্র্যাক</Link>
          <Link href="/account">অ্যাকাউন্ট</Link>
          <Link href="/products" className={styles.headerAction}>শপিং শুরু করুন ↗</Link>
        </nav>
      </header>

      <main className={styles.main}>
        <section className={styles.hero}>
          <span className={styles.kicker}>YOUR DIGITAL COMMERCE DESTINATION</span>
          <h1>
            কেনাকাটা ও সেবা,
            <br />
            <span>এক জায়গায় সহজভাবে।</span>
          </h1>
          <p className={styles.heroCopy}>
            NEWEIX-এ স্বাগতম। পণ্য কেনা, অর্ডার পরিচালনা এবং প্রয়োজনীয়
            সেবায় পৌঁছানোর জন্য একটি সহজ, নির্ভরযোগ্য ও আধুনিক অভিজ্ঞতা।
          </p>
          <div className={styles.heroMeta}>
            <span className={styles.metaPill}>বাংলা ও English</span>
            <span className={styles.metaPill}>মোবাইল-ফ্রেন্ডলি অভিজ্ঞতা</span>
            <span className={styles.metaPill}>নিরাপদ অ্যাকাউন্ট অ্যাক্সেস</span>
          </div>
        </section>

        <section aria-labelledby="services-heading">
          <div className={styles.sectionHead}>
            <div>
              <span className={styles.kicker}>NEWEIX SERVICES</span>
              <h2 id="services-heading">আপনার প্রয়োজনীয় সেবা</h2>
            </div>
            <p>একটি সেবা নির্বাচন করে এগিয়ে যান</p>
          </div>

          <div className={styles.serviceGrid}>
            {portalServices.map((service) => (
              <Link className={styles.serviceCard} href={service.href} key={service.href}>
                <div className={styles.cardTop}>
                  <span className={`${styles.icon} ${accentClass[service.accent]}`} aria-hidden="true">
                    {iconGlyph[service.icon]}
                  </span>
                  <span className={styles.eyebrow}>{service.eyebrow}</span>
                </div>
                <h3>{service.title}</h3>
                <p>{service.description}</p>
                <span className={styles.cardArrow} aria-hidden="true">→</span>
              </Link>
            ))}
          </div>
        </section>

        <footer className={styles.footer}>
          <strong>NEWEIX</strong>
          <span>স্মার্ট কেনাকাটা, আরও সুন্দর অভিজ্ঞতা।</span>
          <span>© {new Date().getFullYear()} NEWEIX. সর্বস্বত্ব সংরক্ষিত।</span>
        </footer>
      </main>
    </div>
  );
}

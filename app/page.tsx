import Link from "next/link";
import { services } from "@/lib/site-data";
import { ShoppingBag, Wallet, Sparkles, UserRound, ArrowUpRight, Check, Plus, Plug, LayoutGrid } from "lucide-react";

const serviceIcons = { eixon: Wallet, shop: ShoppingBag, "neweix-plus": Plus, connect: Plug, eixora: Sparkles, account: UserRound };

const highlights = [
  { title: "একটি কেন্দ্রীয় Ecosystem", description: "বিভিন্ন প্রয়োজনের জন্য আলাদা সার্ভিস, একই পরিচিত Neweix অভিজ্ঞতার অধীনে।" },
  { title: "নিজস্ব সার্ভিস অভিজ্ঞতা", description: "প্রতিটি সেবার জন্য আলাদা পেজ, কাজের ধরন ও ভবিষ্যৎ ফিচার।" },
  { title: "ধাপে ধাপে উন্নয়ন", description: "প্রতিটি সার্ভিসের বর্তমান অবস্থা স্পষ্টভাবে জানানো হবে।" },
];

export default function NeweixHomePage() {
  return (
    <div className="home-page">
      <section className="hero-section">
        <div className="hero-copy">
          <span className="eyebrow"><i /> THE NEWEIX ECOSYSTEM</span>
          <h1>একটি জায়গা থেকে<br /><span>পুরো Neweix আবিষ্কার করুন।</span></h1>
          <p>Neweix-এর সব সার্ভিস, ডিজিটাল অভিজ্ঞতা, গুরুত্বপূর্ণ তথ্য ও আপডেট একসঙ্গে দেখুন। আপনার প্রয়োজনের বিভাগে প্রবেশ করুন সহজেই।</p>
          <div className="hero-actions">
            <Link href="/services" className="button-primary">সব সার্ভিস দেখুন <ArrowUpRight size={16}/></Link>
            <Link href="/about" className="button-secondary">Neweix সম্পর্কে</Link>
          </div>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="orbit orbit-one" /><div className="orbit orbit-two" />
          <div className="orbit-core"><strong>N</strong><small>NEWEIX</small></div>
          <div className="orbit-node node-top">S</div><div className="orbit-node node-right">E</div>
          <div className="orbit-node node-bottom">X</div><div className="orbit-node node-left">C</div>
          <span className="art-caption">ONE CONNECTED ECOSYSTEM</span>
        </div>
        <div className="hero-glow" />
      </section>

      <section className="quick-section">
        <div className="section-heading"><div><span className="eyebrow">EXPLORE NEWEIX</span><h2>প্রধান বিভাগ</h2></div><Link href="/services" className="text-link">সব বিভাগ <ArrowUpRight size={15}/></Link></div>
        <div className="quick-grid">
          <Link href="/shop" className="quick-card"><span className="quick-symbol shop-symbol"><ShoppingBag size={23} strokeWidth={1.8}/></span><span className="quick-card-copy"><strong>Neweix Shop</strong><small>পণ্য ও কেনাকাটা</small></span><span className="quick-arrow"><ArrowUpRight size={18}/></span></Link>
          <Link href="/coming-soon?service=eixon" className="quick-card"><span className="quick-symbol wallet-symbol"><Wallet size={23} strokeWidth={1.8}/></span><span className="quick-card-copy"><strong>Eixon</strong><small>Wallet ও financial service</small></span><span className="quick-arrow">↗</span></Link>
          <Link href="/coming-soon?service=eixora" className="quick-card eixora-feature"><span className="quick-symbol"><Sparkles size={23} strokeWidth={1.8}/></span><span className="quick-card-copy"><strong>Eixora</strong><small>Social ও Home Feed</small></span><span className="quick-arrow">↗</span></Link>
          <a href="https://www.accounts.neweix.com" className="quick-card"><span className="quick-symbol account-symbol"><UserRound size={23} strokeWidth={1.8}/></span><span className="quick-card-copy"><strong>Neweix Account</strong><small>Central Account ও পরিচয় ব্যবস্থাপনা</small></span><span className="quick-arrow">↗</span></a>
        </div>
      </section>

      <section className="services-section">
        <div className="section-heading"><div><span className="eyebrow">OUR SERVICES</span><h2>Neweix-এর সব সার্ভিস</h2><p>প্রতিটি সার্ভিসের বিস্তারিত ও বর্তমান অবস্থা দেখুন।</p></div><Link href="/services" className="text-link">সার্ভিস ডিরেক্টরি <ArrowUpRight size={15}/></Link></div>
        <div className="service-grid">
          {services.map((service) => { const Icon = serviceIcons[service.id as keyof typeof serviceIcons] || LayoutGrid; return <Link href={service.id === "shop" ? "/shop" : service.href} className="service-card" key={service.id}>
            <span className={"service-mark " + service.tone}><Icon size={21} strokeWidth={1.8}/></span>
            <span className="service-category">{service.category}</span>
            <strong>{service.name}</strong>
            <p>{service.description}</p>
            <span className="service-open"><span>{service.status === "in-development" ? "উন্নয়নাধীন" : "শীঘ্রই চালু হবে"}</span><ArrowUpRight size={15}/></span>
          </Link>; })}
        </div>
      </section>

      <section className="ecosystem-banner">
        <div className="banner-orb" />
        <div><span className="eyebrow">CONNECTED BY DESIGN</span><h2>একটি Ecosystem.<br />বিভিন্ন অভিজ্ঞতা।</h2><p>Neweix-এর প্রতিটি সার্ভিস নিজস্ব কাজ ও অভিজ্ঞতা নিয়ে তৈরি হচ্ছে, যাতে ব্যবহারকারীরা প্রয়োজন অনুযায়ী সঠিক জায়গায় যেতে পারেন।</p></div>
        <Link href="/ecosystem" className="banner-link">Ecosystem সম্পর্কে জানুন <ArrowUpRight size={15}/></Link>
      </section>

      <section className="updates-section">
        <div className="section-heading"><div><span className="eyebrow">LATEST INFORMATION</span><h2>ঘোষণা ও আপডেট</h2></div><Link href="/updates" className="text-link">সব আপডেট <ArrowUpRight size={15}/></Link></div>
        <div className="update-card"><span className="update-dot" /><div><strong>Neweix সার্ভিসগুলো ধাপে ধাপে প্রস্তুত হচ্ছে</strong><p>প্রতিটি সার্ভিসের পেজে তার বর্তমান উন্নয়ন অবস্থা দেখানো হবে। চালু হওয়ার আগে কোনো ফিচারকে সক্রিয় হিসেবে দেখানো হবে না।</p></div><span className="update-label">ECOSYSTEM UPDATE</span></div>
      </section>

      <section className="quick-section">
        <div className="section-heading"><div><span className="eyebrow">WHY NEWEIX</span><h2>এক নজরে Neweix</h2></div></div>
        <div className="related-grid">{highlights.map((item) => <article className="related-card" key={item.title}><span><Check size={17}/></span><strong>{item.title}</strong><small>{item.description}</small></article>)}</div>
      </section>

      <section className="help-strip"><div><span className="eyebrow">NEED MORE INFORMATION?</span><h2>আরও জানতে বা সাহায্য পেতে</h2><p>Neweix সম্পর্কে জানুন, সাধারণ প্রশ্ন দেখুন অথবা যোগাযোগ করুন।</p></div><Link href="/help" className="button-secondary">Help Center <ArrowUpRight size={15}/></Link></section>
    </div>
  );
}

import Link from "next/link";
import {
  ArrowUpRight,
  Check,
  CircleDot,
  LayoutGrid,
  Plug,
  Plus,
  ShoppingBag,
  Sparkles,
  UserRound,
  Wallet,
} from "lucide-react";
import { services } from "@/lib/site-data";

const serviceIcons = {
  shop: ShoppingBag,
  account: UserRound,
  eixon: Wallet,
  connect: Plug,
  "neweix-plus": Plus,
  eixora: Sparkles,
};

function ServiceCard({ service }: { service: (typeof services)[number] }) {
  const Icon = serviceIcons[service.id as keyof typeof serviceIcons] || LayoutGrid;
  const content = (
    <>
      <span className="service-card-topline">
        <span className="service-mark"><Icon size={22} strokeWidth={1.8} /></span>
        <span className={`service-status service-status-${service.status}`}>
          <CircleDot size={10} strokeWidth={2.2} />
          {service.statusLabel}
        </span>
      </span>
      <span className="service-category">{service.category}</span>
      <strong>{service.name}</strong>
      <p>{service.description}</p>
      <span className="service-open">{service.actionLabel}<ArrowUpRight size={16} /></span>
    </>
  );

  return service.href.startsWith("https://") ? (
    <a href={service.href} className="service-card">{content}</a>
  ) : (
    <Link href={service.href} className="service-card">{content}</Link>
  );
}

export default function NeweixHomePage() {
  const available = services.filter((service) => service.status === "active").length;
  const building = services.filter((service) => service.status === "in-development").length;
  const planned = services.filter((service) => service.status === "planned").length;

  return (
    <div className="home-page">
      <section className="hero-section">
        <div className="hero-copy">
          <span className="eyebrow"><i /> ONE CONNECTED ECOSYSTEM</span>
          <h1>একটি পরিচয়।<br /><span>অনেকগুলো অভিজ্ঞতা।</span></h1>
          <p>
            Neweix হলো নিজস্ব ডিজিটাল সার্ভিসের একটি সমন্বিত ইকোসিস্টেম।
            কেনাকাটা, Account, যোগাযোগ, সদস্যতা ও অন্যান্য সেবা এক জায়গা থেকে আবিষ্কার করুন।
          </p>
          <div className="hero-actions">
            <Link href="/services" className="button-primary">সব সার্ভিস দেখুন <ArrowUpRight size={16} /></Link>
            <a href="https://www.shop.neweix.com" className="button-secondary">Neweix Shop <ShoppingBag size={15} /></a>
          </div>
          <div className="hero-stats" aria-label="Service status summary">
            <span><strong>{services.length}</strong>টি সার্ভিস</span>
            <span><strong>{available}</strong>টি স্টোরফ্রন্ট চালু</span>
            <span><strong>{building + planned}</strong>টি প্রস্তুত হচ্ছে</span>
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

      <section className="services-section home-services">
        <div className="section-heading">
          <div>
            <span className="eyebrow">EXPLORE NEWEIX</span>
            <h2>Neweix-এর সার্ভিসসমূহ</h2>
            <p>কোন সার্ভিস চালু, কোনটি উন্নয়নাধীন, আর কোনটি পরিকল্পনায় আছে তা স্পষ্টভাবে দেখুন।</p>
          </div>
          <Link href="/services" className="text-link">সম্পূর্ণ ডিরেক্টরি <ArrowUpRight size={15} /></Link>
        </div>
        <div className="service-grid">
          {services.map((service) => <ServiceCard key={service.id} service={service} />)}
        </div>
      </section>

      <section className="ecosystem-banner">
        <div className="banner-orb" />
        <div>
          <span className="eyebrow">BUILT AS ONE ECOSYSTEM</span>
          <h2>একটি Ecosystem.<br />একই Neweix পরিচয়।</h2>
          <p>প্রতিটি সার্ভিসের আলাদা কাজ ও অভিজ্ঞতা থাকবে। তবে সার্ভিসের অবস্থা, প্রবেশপথ এবং প্রয়োজনীয় তথ্য থাকবে একই কেন্দ্রীয় জায়গায়।</p>
        </div>
        <Link href="/services" className="banner-link">সার্ভিসগুলো দেখুন <ArrowUpRight size={15} /></Link>
      </section>

      <section className="home-principles">
        <div className="principle-item"><span><Check size={17} /></span><div><strong>একটি কেন্দ্রীয় প্রবেশদ্বার</strong><p>Neweix-এর নিজস্ব সার্ভিসগুলো এক জায়গা থেকে খুঁজে পাওয়া যাবে।</p></div></div>
        <div className="principle-item"><span><Check size={17} /></span><div><strong>পরিষ্কার সার্ভিস স্ট্যাটাস</strong><p>চালু, উন্নয়নাধীন ও পরিকল্পিত সেবার মধ্যে স্পষ্ট পার্থক্য থাকবে।</p></div></div>
        <div className="principle-item"><span><Check size={17} /></span><div><strong>একটি পরিচিত ডিজাইন সিস্টেম</strong><p>সব সার্ভিসে Neweix-এর মূল রঙ, টাইপোগ্রাফি ও নেভিগেশন বজায় থাকবে।</p></div></div>
      </section>
    </div>
  );
}

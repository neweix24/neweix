import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  CircleDot,
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
  employees: UserRound,
};

export const metadata = {
  title: "সব সার্ভিস",
  description: "Neweix ecosystem-এর সব সার্ভিস, প্রবেশপথ ও বর্তমান উন্নয়ন অবস্থা।",
};

export default function ServicesPage() {
  const active = services.filter((service) => service.status === "active").length;
  const inDevelopment = services.filter((service) => service.status === "in-development").length;
  const planned = services.filter((service) => service.status === "planned").length;

  return (
    <div className="inner-page services-directory">
      <div className="breadcrumbs"><Link href="/">Neweix</Link><span>/</span><span>সার্ভিসসমূহ</span></div>
      <section className="directory-hero">
        <span className="eyebrow"><i /> NEWEIX SERVICE DIRECTORY</span>
        <h1>Neweix-এর সব সার্ভিস, এক জায়গায়।</h1>
        <p>প্রতিটি সার্ভিসের কাজ, প্রবেশপথ এবং বর্তমান অবস্থা এখানে দেখানো হয়। কোনো ফিচার চালু না হলে সেটিকে চালু বলে দেখানো হবে না।</p>
        <div className="directory-stats">
          <div><strong>{services.length.toString().padStart(2, "0")}</strong><span>মোট সার্ভিস</span></div>
          <div><strong>{active.toString().padStart(2, "0")}</strong><span>স্টোরফ্রন্ট চালু</span></div>
          <div><strong>{inDevelopment.toString().padStart(2, "0")}</strong><span>উন্নয়নাধীন</span></div>
          <div><strong>{planned.toString().padStart(2, "0")}</strong><span>পরিকল্পনাধীন</span></div>
        </div>
      </section>

      <section className="directory-section">
        <div className="directory-section-heading">
          <div><span className="eyebrow">ALL SERVICES</span><h2>সার্ভিস ডিরেক্টরি</h2></div>
          <span>{services.length}টি সার্ভিস তালিকাভুক্ত</span>
        </div>
        <div className="directory-grid">
          {services.map((service) => {
            const Icon = serviceIcons[service.id as keyof typeof serviceIcons] || ShoppingBag;
            const card = (
              <>
                <div className="directory-card-head">
                  <span className="directory-icon"><Icon size={23} strokeWidth={1.8} /></span>
                  <span className={`service-status service-status-${service.status}`}><CircleDot size={10} />{service.statusLabel}</span>
                </div>
                <span className="service-category">{service.category}</span>
                <h3>{service.name}</h3>
                <p>{service.description}</p>
                <span className="directory-action">{service.actionLabel}<ArrowUpRight size={16} /></span>
              </>
            );
            return service.href.startsWith("https://") ? (
              <a href={service.href} key={service.id} className="directory-card">{card}</a>
            ) : (
              <Link href={service.href} key={service.id} className="directory-card">{card}</Link>
            );
          })}
        </div>
      </section>

      <section className="directory-note">
        <div><strong>সার্ভিসের অবস্থা সম্পর্কে</strong><p>“স্টোরফ্রন্ট চালু” মানে Shop-এর ওয়েবসাইট পাওয়া যাচ্ছে। ক্যাটালগ, অর্ডার, পেমেন্ট ও চেকআউট আলাদাভাবে প্রস্তুত ও যাচাই না হওয়া পর্যন্ত সেগুলো চালু হিসেবে দেখানো হবে না।</p></div>
        <Link href="/" className="directory-back"><ArrowLeft size={15} /> হোমপেজে ফিরুন</Link>
      </section>
    </div>
  );
}

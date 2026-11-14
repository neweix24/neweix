import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

export default function ShopPage() {
  return <div className="home-page">
    <section className="hero-section"><div className="hero-copy"><span className="eyebrow"><i/> NEWEIX SHOP</span><h1>আপনার পছন্দের<br/><span>কেনাকাটা শুরু হোক।</span></h1><p>Neweix Shop-এ পণ্য আবিষ্কার, পছন্দের জিনিস খোঁজা এবং সহজে অর্ডার করার অভিজ্ঞতা তৈরি হচ্ছে। সার্ভিসটি চালু হলে এখানে পণ্য ও ক্যাটালগ দেখা যাবে।</p><div className="hero-actions"><Link href="/coming-soon?service=shop" className="button-primary">Shop-এর অবস্থা দেখুন <ArrowUpRight size={15}/></Link><Link href="/" className="button-secondary">Neweix Homepage</Link></div></div><div className="hero-art" aria-hidden="true"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="orbit-core"><strong>S</strong><small>SHOP</small></div><div className="orbit-node node-top">N</div><div className="orbit-node node-right">+</div><div className="orbit-node node-bottom">E</div><div className="orbit-node node-left">W</div><span className="art-caption">NEWEIX SHOP</span></div><div className="hero-glow"/></section>
    <section className="updates-section"><div className="section-heading"><div><span className="eyebrow">SHOPPING EXPERIENCE</span><h2>Neweix Shop প্রস্তুত হচ্ছে</h2></div><span className="update-label">COMING SOON</span></div><div className="update-card"><span className="update-dot"/><div><strong>পণ্য ও ক্যাটালগ শিগগিরই এখানে</strong><p>বাস্তব পণ্য, মূল্য ও প্রাপ্যতার তথ্য যুক্ত হলে এই জায়গায় দেখা যাবে।</p></div></div></section>
    <section className="help-strip"><div><span className="eyebrow">DISCOVER NEWEIX</span><h2>Neweix-এর অন্যান্য সার্ভিস</h2><p>মূল ওয়েবসাইটে ফিরে পুরো ecosystem দেখুন।</p></div><Link href="/" className="button-secondary">Homepage দেখুন <ArrowUpRight size={15}/></Link></section>
  </div>;
}

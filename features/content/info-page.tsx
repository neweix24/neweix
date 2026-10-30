import Link from "next/link";
import type { InfoPageData } from "./info-page-data";

export default function InfoPage({ data }: { data: InfoPageData }) {
  return (
    <main className="info-page mx-auto min-h-screen w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <Link href="/" className="inline-flex min-h-10 items-center text-sm font-bold" style={{ color: "var(--primary)" }}>← NEWEIX হোম</Link>
      <header className="info-page-header my-7">
        <p className="eyebrow">{data.eyebrow}</p>
        <h1>{data.title}</h1>
        <p className="mt-5 max-w-3xl text-base leading-8 sm:text-lg">{data.description}</p>
      </header>
      <div className="grid gap-4 sm:gap-5">
        {data.sections.map((section, index) => (
          <section key={section.title} className="info-page-section">
            <p className="mb-2 text-xs font-extrabold tracking-widest" style={{ color: "var(--primary)" }}>0{index + 1}</p>
            <h2>{section.title}</h2>
            {section.body.map((paragraph, paragraphIndex) => <p className="mt-3 leading-8" key={paragraphIndex}>{paragraph}</p>)}
          </section>
        ))}
      </div>
      <footer className="info-page-footer flex flex-wrap gap-x-6 gap-y-3 text-sm font-semibold" style={{ borderColor: "var(--border)" }}>
        <Link href="/products">পণ্য</Link><Link href="/track-order">অর্ডার ট্র্যাক</Link><Link href="/contact">যোগাযোগ</Link><Link href="/privacy">গোপনীয়তা</Link><Link href="/terms">শর্তাবলি</Link>
      </footer>
    </main>
  );
}

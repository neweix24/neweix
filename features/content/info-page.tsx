import Link from "next/link";
import type { InfoPageData } from "./info-page-data";

export default function InfoPage({ data }: { data: InfoPageData }) {
  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
      <Link href="/" className="text-sm font-semibold" style={{ color: "var(--primary)" }}>← NEWEIX হোম</Link>
      <header className="my-10 max-w-3xl">
        <p className="eyebrow">{data.eyebrow}</p>
        <h1 className="text-3xl font-black leading-tight sm:text-5xl">{data.title}</h1>
        <p className="mt-5 text-base sm:text-lg">{data.description}</p>
      </header>
      <div className="grid gap-4">
        {data.sections.map((section) => (
          <section key={section.title} className="rounded-2xl border p-5 sm:p-7" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
            <h2 className="text-xl font-bold">{section.title}</h2>
            {section.body.map((paragraph, index) => <p className="mt-3" key={index}>{paragraph}</p>)}
          </section>
        ))}
      </div>
      <footer className="mt-10 flex flex-wrap gap-4 border-t pt-6 text-sm" style={{ borderColor: "var(--border)" }}>
        <Link href="/products">পণ্য</Link><Link href="/track-order">অর্ডার ট্র্যাক</Link><Link href="/contact">যোগাযোগ</Link><Link href="/privacy">গোপনীয়তা</Link><Link href="/terms">শর্তাবলি</Link>
      </footer>
    </main>
  );
}

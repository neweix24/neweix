"use client";

import Link from "next/link";
import { useEffect } from "react";
import Icon from "@/components/ui/icon";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("NEWEIX application error:", error);
  }, [error]);

  return (
    <main className="min-h-screen grid place-items-center px-5 py-12" style={{ background: "var(--bg)", color: "var(--ink)" }}>
      <section className="w-full max-w-xl rounded-2xl border p-7 text-center" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
        <p className="eyebrow">NEWEIX · SYSTEM MESSAGE</p>
        <h1 className="text-3xl font-black">Sorry, something went wrong</h1>
        <p className="mt-3">The page could not be loaded. Please try again or return to the homepage.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button type="button" onClick={() => reset()} className="rounded-full px-5 py-3 font-bold" style={{ background: "var(--primary)", color: "#080b09" }}><Icon name="refresh" size={17} /> Try again</button>
          <Link href="/" className="rounded-full border px-5 py-3 font-bold" style={{ borderColor: "var(--border)" }}><Icon name="home" size={17} /> Home</Link>
        </div>
      </section>
    </main>
  );
}

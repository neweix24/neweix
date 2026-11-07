import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Supreme Sign In",
  robots: { index: false, follow: false, noarchive: true },
};

function DiamondMark() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 120 120"
      className="h-20 w-20"
      fill="none"
    >
      <path d="M60 8 105 43 60 112 15 43 60 8Z" stroke="#D9B65D" strokeWidth="4" />
      <path d="M15 43h90M38 43l22 69 22-69M38 43l22-35 22 35" stroke="#D9B65D" strokeWidth="2.5" />
      <path d="M77 31c-5-7-23-8-30-1-9 9 1 17 14 20 13 3 19 9 12 18-7 9-24 8-33 0" stroke="#F5E5B4" strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}

export default function SupremeSignInPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#070707] px-5 py-12 text-white">
      <section className="w-full max-w-md rounded-[28px] border border-[#9B7B35]/40 bg-[linear-gradient(155deg,#171717,#090909_65%)] p-7 shadow-[0_24px_90px_rgba(0,0,0,.55)] sm:p-10">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-5 flex h-28 w-28 items-center justify-center rounded-[30px] border border-[#B89445]/30 bg-black shadow-[inset_0_0_30px_rgba(212,175,55,.08)]">
            <DiamondMark />
          </div>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[.35em] text-[#D9B65D]">
            NEWEIX · PRIVATE ACCESS
          </p>
          <h1 className="text-3xl font-semibold tracking-[.12em] text-[#F8EBCB]">
            SUPREME
          </h1>
          <p className="mt-3 max-w-xs text-sm leading-6 text-neutral-400">
            Secure sign-in for the private Supreme workspace.
          </p>
        </div>

        <div className="space-y-4">
          <label className="block text-sm font-medium text-neutral-300" htmlFor="supreme-email">
            Email address
          </label>
          <input
            id="supreme-email"
            type="email"
            autoComplete="username"
            disabled
            placeholder="Supreme account email"
            className="w-full rounded-xl border border-neutral-800 bg-black/60 px-4 py-3 text-white placeholder:text-neutral-600 disabled:cursor-not-allowed disabled:opacity-70"
          />
          <label className="block text-sm font-medium text-neutral-300" htmlFor="supreme-password">
            Password
          </label>
          <input
            id="supreme-password"
            type="password"
            autoComplete="current-password"
            disabled
            placeholder="Password"
            className="w-full rounded-xl border border-neutral-800 bg-black/60 px-4 py-3 text-white placeholder:text-neutral-600 disabled:cursor-not-allowed disabled:opacity-70"
          />
          <button
            type="button"
            disabled
            className="w-full rounded-xl border border-[#B89445]/40 bg-[#B89445]/15 px-4 py-3 font-semibold tracking-wide text-[#E8D39C] disabled:cursor-not-allowed"
          >
            Secure sign-in is locked
          </button>
        </div>

        <div className="mt-6 rounded-xl border border-amber-500/25 bg-amber-500/[.06] p-4">
          <p className="text-sm font-semibold text-amber-200">
            Device security verification is being completed
          </p>
          <p className="mt-2 text-xs leading-5 text-neutral-400">
            Supreme access stays disabled until the server verifies the genuine Android app, its hardware-backed device key, Google certificate chain and revocation status. A private URL or browser header is not accepted as proof.
          </p>
        </div>

        <p className="mt-7 text-center text-[11px] tracking-wide text-neutral-600">
          PRIVATE ADMINISTRATIVE ACCESS · NO CUSTOMER STOREFRONT
        </p>
      </section>
    </main>
  );
}

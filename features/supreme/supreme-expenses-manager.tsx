"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type Expense = {
  id: string;
  expense_date: string;
  category: string;
  amount: number;
  description: string;
  vendor: string | null;
  reference_number: string | null;
  created_at: string;
};

const categories = [
  ["rent", "ভাড়া"], ["salary", "বেতন"], ["utilities", "বিদ্যুৎ/ইউটিলিটি"],
  ["marketing", "মার্কেটিং"], ["packaging", "প্যাকেজিং"], ["transport", "পরিবহন"],
  ["warehouse", "গুদাম"], ["software", "সফটওয়্যার"], ["maintenance", "রক্ষণাবেক্ষণ"],
  ["office", "অফিস"], ["other", "অন্যান্য"],
] as const;

const money = new Intl.NumberFormat("bn-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 0 });

function todayLocal() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

export default function SupremeExpensesManager() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [from, setFrom] = useState(todayLocal().slice(0, 8) + "01");
  const [to, setTo] = useState(todayLocal());
  const [expenseDate, setExpenseDate] = useState(todayLocal());
  const [category, setCategory] = useState<string>("other");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [vendor, setVendor] = useState("");
  const [reference, setReference] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ from, to, page: "1" });
      const response = await fetch("/api/supreme/finance/expenses?" + params.toString(), { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "ব্যয়ের তথ্য লোড করা যায়নি।");
      setExpenses(Array.isArray(payload.expenses) ? payload.expenses : []);
      setTotal(Number(payload.pagination?.total ?? 0));
    } catch (err) {
      setError(err instanceof Error ? err.message : "ব্যয়ের তথ্য লোড করা যায়নি।");
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => { void load(); }, [load]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/supreme/finance/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expense_date: expenseDate,
          category,
          amount: Number(amount),
          description,
          vendor: vendor.trim() || null,
          reference_number: reference.trim() || null,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "ব্যয় সংরক্ষণ করা যায়নি।");
      setAmount("");
      setDescription("");
      setVendor("");
      setReference("");
      setNotice("ব্যয় সফলভাবে সংরক্ষণ ও Audit Log-এ নথিভুক্ত হয়েছে।");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ব্যয় সংরক্ষণ করা যায়নি।");
    } finally {
      setSaving(false);
    }
  }

  const visibleTotal = expenses.reduce((sum, expense) => sum + Number(expense.amount), 0);

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-4 py-6 text-white sm:px-6">
      <div className="mb-6 rounded-3xl border border-amber-300/20 bg-gradient-to-br from-[#171717] via-[#101827] to-[#080b12] p-5 shadow-2xl sm:p-7">
        <p className="text-xs font-bold uppercase tracking-[0.25em] text-amber-300">Supreme Finance</p>
        <h1 className="mt-2 text-2xl font-black sm:text-3xl">পরিচালন ব্যয়ের খাতা</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">প্রতিটি ব্যয় তারিখ, বিভাগ ও প্রমাণ-রেফারেন্সসহ নথিভুক্ত হবে। প্রতিটি এন্ট্রি Audit Log-এ সংরক্ষিত থাকবে।</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
            <p className="text-xs text-slate-400">নির্বাচিত সময়ের দেখানো ব্যয়</p>
            <p className="mt-1 text-2xl font-black text-amber-300">{money.format(visibleTotal)}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
            <p className="text-xs text-slate-400">মোট এন্ট্রি (নির্বাচিত সময়)</p>
            <p className="mt-1 text-2xl font-black">{total.toLocaleString("bn-BD")}</p>
          </div>
        </div>
      </div>

      <section className="mb-6 rounded-3xl border border-white/10 bg-[#111827] p-4 sm:p-6">
        <h2 className="text-lg font-bold">নতুন ব্যয় যোগ করুন</h2>
        <form onSubmit={submit} className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm text-slate-300">ব্যয়ের তারিখ
            <input required type="date" value={expenseDate} onChange={e => setExpenseDate(e.target.value)} className="rounded-xl border border-white/15 bg-[#090e18] px-3 py-3 text-white" />
          </label>
          <label className="grid gap-1.5 text-sm text-slate-300">ব্যয়ের খাত
            <select value={category} onChange={e => setCategory(e.target.value)} className="rounded-xl border border-white/15 bg-[#090e18] px-3 py-3 text-white">
              {categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm text-slate-300">পরিমাণ (BDT)
            <input required min="1" max="1000000000" step="1" type="number" inputMode="numeric" value={amount} onChange={e => setAmount(e.target.value)} placeholder="যেমন ১৫০০" className="rounded-xl border border-white/15 bg-[#090e18] px-3 py-3 text-white" />
          </label>
          <label className="grid gap-1.5 text-sm text-slate-300">প্রতিষ্ঠান / যাকে দিয়েছেন (ঐচ্ছিক)
            <input maxLength={160} value={vendor} onChange={e => setVendor(e.target.value)} placeholder="নাম" className="rounded-xl border border-white/15 bg-[#090e18] px-3 py-3 text-white" />
          </label>
          <label className="grid gap-1.5 text-sm text-slate-300 sm:col-span-2">ব্যয়ের বিবরণ
            <textarea required minLength={3} maxLength={1000} rows={3} value={description} onChange={e => setDescription(e.target.value)} placeholder="কী কারণে এই ব্যয় হয়েছে লিখুন" className="rounded-xl border border-white/15 bg-[#090e18] px-3 py-3 text-white" />
          </label>
          <label className="grid gap-1.5 text-sm text-slate-300 sm:col-span-2">রসিদ / লেনদেন রেফারেন্স (ঐচ্ছিক)
            <input maxLength={120} value={reference} onChange={e => setReference(e.target.value)} placeholder="রসিদ নম্বর বা ট্রানজেকশন রেফারেন্স" className="rounded-xl border border-white/15 bg-[#090e18] px-3 py-3 text-white" />
          </label>
          <button disabled={saving} className="rounded-xl bg-gradient-to-r from-amber-300 to-yellow-500 px-5 py-3 font-black text-black disabled:opacity-50 sm:col-span-2">{saving ? "সংরক্ষণ হচ্ছে…" : "ব্যয় সংরক্ষণ করুন"}</button>
        </form>
      </section>

      <section className="rounded-3xl border border-white/10 bg-[#111827] p-4 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><h2 className="text-lg font-bold">ব্যয়ের ইতিহাস</h2><p className="mt-1 text-xs text-slate-400">প্রতি পাতায় সর্বোচ্চ ৫০টি এন্ট্রি</p></div>
          <div className="flex flex-wrap gap-2">
            <label className="grid gap-1 text-xs text-slate-400">শুরু <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="rounded-lg border border-white/15 bg-[#090e18] px-2 py-2 text-white" /></label>
            <label className="grid gap-1 text-xs text-slate-400">শেষ <input type="date" value={to} onChange={e => setTo(e.target.value)} className="rounded-lg border border-white/15 bg-[#090e18] px-2 py-2 text-white" /></label>
          </div>
        </div>
        {error && <p role="alert" className="mt-4 rounded-xl border border-rose-400/30 bg-rose-950/30 p-3 text-sm text-rose-200">{error}</p>}
        {notice && <p role="status" className="mt-4 rounded-xl border border-emerald-400/30 bg-emerald-950/30 p-3 text-sm text-emerald-200">{notice}</p>}
        {loading ? <p className="py-8 text-center text-sm text-slate-400">তথ্য লোড হচ্ছে…</p> :
          expenses.length === 0 ? <p className="py-8 text-center text-sm text-slate-400">এই সময়সীমায় কোনো ব্যয় নথিভুক্ত নেই।</p> :
          <div className="mt-4 divide-y divide-white/10">
            {expenses.map(expense => <article key={expense.id} className="grid gap-2 py-4 sm:grid-cols-[1fr_auto] sm:items-center">
              <div><div className="flex flex-wrap items-center gap-2"><strong>{categories.find(([value]) => value === expense.category)?.[1] ?? expense.category}</strong><span className="text-xs text-slate-500">{expense.expense_date}</span></div>
                <p className="mt-1 text-sm text-slate-300">{expense.description}</p>
                {(expense.vendor || expense.reference_number) && <p className="mt-1 text-xs text-slate-500">{[expense.vendor, expense.reference_number].filter(Boolean).join(" · ")}</p>}
              </div>
              <strong className="text-lg text-amber-300">{money.format(expense.amount)}</strong>
            </article>)}
          </div>}
      </section>
      <p className="mt-5 text-xs leading-5 text-slate-500">নোট: ব্যয়ের এন্ট্রি মুছে ফেলার সুবিধা নেই—হিসাবের নির্ভরযোগ্যতা বজায় রাখতে প্রতিটি রেকর্ড সংরক্ষিত থাকে। এই পেজ এখনো Profit/Loss ঘোষণা করে না।</p>
    </main>
  );
}

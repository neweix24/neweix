"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type ProductCost = { id: string; name: string; sku: string | null; purchase_cost: number | null; price: number };

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
  const [products, setProducts] = useState<ProductCost[]>([]);
  const [costDrafts, setCostDrafts] = useState<Record<string, string>>({});
  const [costSaving, setCostSaving] = useState<string | null>(null);
  const [costMessage, setCostMessage] = useState("");
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 50;
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
      const params = new URLSearchParams({ from, to, page: String(page) });
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
  }, [from, to, page]);

  useEffect(() => { void load(); }, [load]);

  const loadCosts = useCallback(async () => {
    try {
      const response = await fetch("/api/supreme/finance/product-costs", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "পণ্যের ক্রয়মূল্য লোড হয়নি।");
      const rows = Array.isArray(payload.products) ? payload.products as ProductCost[] : [];
      setProducts(rows);
      setCostDrafts(Object.fromEntries(rows.map(row => [row.id, row.purchase_cost == null ? "" : String(row.purchase_cost)])));
    } catch (err) {
      setCostMessage(err instanceof Error ? err.message : "পণ্যের ক্রয়মূল্য লোড হয়নি।");
    }
  }, []);

  useEffect(() => { void loadCosts(); }, [loadCosts]);

  async function saveCost(productId: string) {
    const value = costDrafts[productId] ?? "";
    if (value !== "" && (!Number.isSafeInteger(Number(value)) || Number(value) < 0 || Number(value) > 1000000000)) {
      setCostMessage("সঠিক ক্রয়মূল্য লিখুন।");
      return;
    }
    setCostSaving(productId);
    setCostMessage("");
    try {
      const response = await fetch("/api/supreme/finance/product-costs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_id: productId, purchase_cost: value === "" ? null : Number(value) }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "ক্রয়মূল্য সংরক্ষণ করা যায়নি।");
      setProducts(current => current.map(product => product.id === productId
        ? { ...product, purchase_cost: payload.product.purchase_cost }
        : product));
      setCostMessage("পণ্যের ক্রয়মূল্য সংরক্ষিত ও Audit Log-এ নথিভুক্ত হয়েছে।");
    } catch (err) {
      setCostMessage(err instanceof Error ? err.message : "ক্রয়মূল্য সংরক্ষণ করা যায়নি।");
    } finally {
      setCostSaving(null);
    }
  }



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
        <div><h2 className="text-lg font-bold">পণ্যের প্রকৃত ক্রয়মূল্য</h2><p className="mt-1 text-sm leading-6 text-slate-400">প্রতি ইউনিটে NEWEIX-এর ক্রয়মূল্য দিন। নতুন অর্ডার তৈরির সময় এই মূল্য অর্ডার লাইনে স্থায়ীভাবে সংরক্ষিত হবে। খালি রাখলে ক্রয়মূল্য অজানা থাকবে।</p></div>
        {costMessage && <p role="status" className="mt-3 rounded-xl border border-amber-300/20 bg-amber-950/20 p-3 text-sm text-amber-200">{costMessage}</p>}
        <div className="mt-4 divide-y divide-white/10">
          {products.map(product => <div key={product.id} className="grid gap-3 py-3 sm:grid-cols-[1fr_180px_auto] sm:items-center">
            <div><strong className="text-sm">{product.name}</strong><p className="mt-1 text-xs text-slate-500">{product.sku || "SKU নেই"} · বিক্রয়মূল্য {money.format(product.price)} · {product.purchase_cost == null ? "ক্রয়মূল্য অজানা" : "ক্রয়মূল্য " + money.format(product.purchase_cost)}</p></div>
            <label className="grid gap-1 text-xs text-slate-400">ক্রয়মূল্য / ইউনিট (BDT)
              <input type="number" min="0" max="1000000000" step="1" inputMode="numeric" value={costDrafts[product.id] ?? ""} onChange={event => setCostDrafts(current => ({ ...current, [product.id]: event.target.value }))} placeholder="অজানা হলে খালি রাখুন" className="w-full rounded-xl border border-white/15 bg-[#090e18] px-3 py-2.5 text-white" />
            </label>
            <button type="button" disabled={costSaving === product.id} onClick={() => void saveCost(product.id)} className="rounded-xl border border-amber-300/40 px-4 py-2.5 text-sm font-bold text-amber-200 disabled:opacity-50">{costSaving === product.id ? "সংরক্ষণ…" : "সংরক্ষণ"}</button>
          </div>)}
          {products.length === 0 && <p className="py-6 text-center text-sm text-slate-400">পণ্যের তথ্য লোড হচ্ছে অথবা কোনো পণ্য পাওয়া যায়নি।</p>}
        </div>
      </section>

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
            <label className="grid gap-1 text-xs text-slate-400">শুরু <input type="date" value={from} onChange={e => { setPage(1); setFrom(e.target.value); }} className="rounded-lg border border-white/15 bg-[#090e18] px-2 py-2 text-white" /></label>
            <label className="grid gap-1 text-xs text-slate-400">শেষ <input type="date" value={to} onChange={e => { setPage(1); setTo(e.target.value); }} className="rounded-lg border border-white/15 bg-[#090e18] px-2 py-2 text-white" /></label>
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
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/10 pt-4">
          <p className="text-xs text-slate-500">পৃষ্ঠা {page.toLocaleString("bn-BD")} · মোট {total.toLocaleString("bn-BD")}টি এন্ট্রি</p>
          <div className="flex gap-2">
            <button type="button" disabled={page <= 1 || loading} onClick={() => setPage(current => Math.max(1, current - 1))} className="rounded-lg border border-white/15 px-3 py-2 text-xs font-bold disabled:opacity-40">আগের পৃষ্ঠা</button>
            <button type="button" disabled={page * pageSize >= total || loading} onClick={() => setPage(current => current + 1)} className="rounded-lg border border-white/15 px-3 py-2 text-xs font-bold disabled:opacity-40">পরের পৃষ্ঠা</button>
          </div>
        </div>
      </section>
      <p className="mt-5 text-xs leading-5 text-slate-500">নোট: ব্যয়ের এন্ট্রি মুছে ফেলার সুবিধা নেই—হিসাবের নির্ভরযোগ্যতা বজায় রাখতে প্রতিটি রেকর্ড সংরক্ষিত থাকে। এই পেজ এখনো Profit/Loss ঘোষণা করে না।</p>
    </main>
  );
}

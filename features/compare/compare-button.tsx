"use client";

import { useEffect, useState } from "react";
import Icon from "@/components/ui/icon";

const KEY = "neweix_compare";
const LIMIT = 4;

function readIds(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(value)
      ? Array.from(new Set(value.filter((id): id is string => typeof id === "string" && id.length > 0))).slice(0, LIMIT)
      : [];
  } catch {
    return [];
  }
}

export default function CompareButton({ productId }: { productId: string }) {
  const [ids, setIds] = useState<string[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => setIds(readIds()), []);

  function toggle() {
    const current = readIds();
    let next: string[];
    if (current.includes(productId)) {
      next = current.filter((id) => id !== productId);
      setMessage("তুলনার তালিকা থেকে পণ্যটি সরানো হয়েছে।");
    } else {
      if (current.length >= LIMIT) {
        setMessage("একসঙ্গে সর্বোচ্চ ৪টি পণ্য তুলনা করা যাবে।");
        setIds(current);
        return;
      }
      next = [...current, productId];
      setMessage("পণ্যটি তুলনার তালিকায় যোগ হয়েছে।");
    }
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
      setIds(next);
      window.dispatchEvent(new Event("neweix-compare-change"));
    } catch {
      setMessage("তুলনার তালিকা সংরক্ষণ করা যায়নি।");
    }
  }

  return (
    <div className="mt-3">
      <button type="button" onClick={toggle} aria-pressed={ids.includes(productId)} className="rounded-xl border px-4 py-2 text-sm font-semibold" style={{ borderColor: "var(--border)", color: "var(--ink)" }}>
        <><Icon name="compare" size={16} /> {ids.includes(productId) ? "তুলনায় আছে" : "তুলনা করুন"}</>
      </button>
      {message && <p role="status" aria-live="polite" className="mt-2 text-sm" style={{ color: "var(--muted)" }}>{message}</p>}
    </div>
  );
}

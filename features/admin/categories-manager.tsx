"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Icon from "@/components/ui/icon";

type Category = {
  id: string; name: string; slug: string; description: string | null;
  image_url: string | null; is_active: boolean; sort_order: number; created_at: string;
};
type Draft = { name: string; slug: string; description: string; image_url: string; sort_order: string; is_active: boolean };
const emptyDraft: Draft = { name: "", slug: "", description: "", image_url: "", sort_order: "0", is_active: true };

export default function CategoriesManager({ role }: { role: string }) {
  const canManage = role === "supreme" || role === "admin";
  const [categories, setCategories] = useState<Category[]>([]);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [editing, setEditing] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/admin/categories", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load categories.");
      setCategories(Array.isArray(data.categories) ? data.categories : []);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not load categories."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  function edit(category: Category) {
    setEditing(category.id);
    setDraft({ name: category.name, slug: category.slug, description: category.description || "", image_url: category.image_url || "", sort_order: String(category.sort_order), is_active: category.is_active });
    setNotice(""); setError("");
  }

  function reset() { setDraft(emptyDraft); setEditing(null); }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    const body = { ...draft, sort_order: Number(draft.sort_order), ...(editing ? { id: editing } : {}) };
    try {
      const response = await fetch("/api/admin/categories", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save changes.");
      setNotice(editing ? "Category updated." : "New category created.");
      reset(); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save changes."); }
    finally { setSaving(false); }
  }

  async function deactivate(category: Category) {
    if (!window.confirm(`Deactivate the “${category.name}” category? Existing product associations will remain intact.`)) return;
    setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/categories", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: category.id }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not deactivate the category.");
      setNotice("Category deactivated."); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not deactivate the category."); }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      {canManage && <section className="rounded-2xl border p-5" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
        <h2 className="text-xl font-bold">{editing ? "Edit Category" : "New Category"}</h2>
        <form onSubmit={submit} className="mt-4 space-y-3">
          <label className="grid gap-1 text-sm">Name<input required maxLength={120} value={draft.name} onChange={e=>setDraft(v=>({...v,name:e.target.value}))} className="rounded-lg border bg-transparent px-3 py-2" style={{borderColor:"var(--border)"}} /></label>
          <label className="grid gap-1 text-sm">Slug<input required maxLength={140} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={draft.slug} onChange={e=>setDraft(v=>({...v,slug:e.target.value}))} className="rounded-lg border bg-transparent px-3 py-2" style={{borderColor:"var(--border)"}} /><span className="text-xs" style={{color:"var(--muted)"}}>Lowercase English letters, numbers, and hyphens</span></label>
          <label className="grid gap-1 text-sm">Description<textarea maxLength={2000} rows={3} value={draft.description} onChange={e=>setDraft(v=>({...v,description:e.target.value}))} className="rounded-lg border bg-transparent px-3 py-2" style={{borderColor:"var(--border)"}} /></label>
          <label className="grid gap-1 text-sm">Image HTTPS URL<input type="url" value={draft.image_url} onChange={e=>setDraft(v=>({...v,image_url:e.target.value}))} className="rounded-lg border bg-transparent px-3 py-2" style={{borderColor:"var(--border)"}} /></label>
          <label className="grid gap-1 text-sm">Sort order<input type="number" min="0" max="1000000" step="1" value={draft.sort_order} onChange={e=>setDraft(v=>({...v,sort_order:e.target.value}))} className="rounded-lg border bg-transparent px-3 py-2" style={{borderColor:"var(--border)"}} /></label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.is_active} onChange={e=>setDraft(v=>({...v,is_active:e.target.checked}))} />Active</label>
          <div className="flex flex-wrap gap-2"><button disabled={saving} className="rounded-xl px-4 py-2 font-semibold" style={{background:"var(--primary)",color:"#10170d"}}><><Icon name={saving ? "refresh" : "check"} size={16} /> {saving?"Saving…":editing?"Update":"Create"}</></button>{editing&&<button type="button" onClick={reset} className="rounded-xl border px-4 py-2" style={{borderColor:"var(--border)"}}><Icon name="close" size={15} /> Cancel</button>}</div>
        </form>
      </section>}
      <section className="rounded-2xl border p-5" style={{borderColor:"var(--border)",background:"var(--surface)"}}>
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold">Category List</h2><p className="mt-1 text-sm" style={{color:"var(--muted)"}}>{categories.length} categories · {canManage?"Editing enabled":"View-only access"}</p></div><button type="button" onClick={()=>void load()} disabled={loading} className="rounded-lg border px-3 py-2 text-sm" style={{borderColor:"var(--border)"}}><Icon name="refresh" size={15} /> Refresh</button></div>
        {error&&<p role="alert" className="mt-4 rounded-xl border border-red-500/40 p-3 text-sm">{error}</p>}{notice&&<p role="status" className="mt-4 rounded-xl border border-emerald-500/40 p-3 text-sm">{notice}</p>}
        {loading?<p className="py-8 text-sm">Loading…</p>:categories.length===0?<p className="py-8 text-sm" style={{color:"var(--muted)"}}>No categories have been created yet.</p>:<div className="mt-4 space-y-3">{categories.map(c=><article key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4" style={{borderColor:"var(--border)"}}><div className="min-w-0"><strong>{c.name}</strong><p className="text-xs" style={{color:"var(--muted)"}}>{c.slug} · Order {c.sort_order} · {c.is_active?"Active":"Inactive"}</p>{c.description&&<p className="mt-1 text-sm">{c.description}</p>}</div>{canManage&&<div className="flex gap-2"><button type="button" onClick={()=>edit(c)} className="rounded-lg border px-3 py-2 text-sm" style={{borderColor:"var(--border)"}}><Icon name="settings" size={15} /> Edit</button>{c.is_active&&<button type="button" onClick={()=>void deactivate(c)} className="rounded-lg border px-3 py-2 text-sm" style={{borderColor:"var(--border)"}}><Icon name="close" size={15} /> Inactive</button>}</div>}</article>)}</div>}
      </section>
    </div>
  );
}

"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import Icon from "@/components/ui/icon";

type Address = {
  id: string; label: string; recipient_name: string; phone: string;
  address_line: string; area: string | null; upazila: string | null;
  district: string; division: string; postal_code: string | null; is_default: boolean;
};

const emptyForm = {
  label: "Home", recipient_name: "", phone: "", address_line: "",
  area: "", upazila: "", district: "", division: "", postal_code: "", is_default: false,
};

export default function CustomerAddresses() {
  const router = useRouter();
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [message, setMessage] = useState("");

  async function loadAddresses() {
    const supabase = createBrowserSupabaseClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) {
      router.replace("/auth/customer-login?next=/account/addresses");
      return;
    }
    const { data, error } = await supabase.from("customer_addresses")
      .select("id,label,recipient_name,phone,address_line,area,upazila,district,division,postal_code,is_default")
      .order("is_default", { ascending: false }).order("created_at", { ascending: false });
    if (error) throw error;
    setAddresses((data ?? []) as Address[]);
  }

  useEffect(() => {
    let active = true;
    void (async () => {
      try { await loadAddresses(); }
      catch (err) {
        if (active) setErrorMessage(err instanceof Error ? err.message : "Could not load addresses.");
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, []);

  function updateField<K extends keyof typeof emptyForm>(key: K, value: (typeof emptyForm)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function beginEdit(address: Address) {
    setEditingId(address.id);
    setForm({
      label: address.label, recipient_name: address.recipient_name, phone: address.phone,
      address_line: address.address_line, area: address.area ?? "", upazila: address.upazila ?? "",
      district: address.district, division: address.division, postal_code: address.postal_code ?? "",
      is_default: address.is_default,
    });
    setMessage(""); setErrorMessage("");
  }

  function resetForm() { setEditingId(null); setForm(emptyForm); }

  async function saveAddress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setMessage(""); setErrorMessage("");
    const payload = {
      label: form.label.trim(), recipient_name: form.recipient_name.trim(), phone: form.phone.trim(),
      address_line: form.address_line.trim(), area: form.area.trim() || null,
      upazila: form.upazila.trim() || null, district: form.district.trim(),
      division: form.division.trim(), postal_code: form.postal_code.trim() || null,
      is_default: form.is_default || addresses.length === 0,
    };
    if (payload.label.length < 1 || payload.recipient_name.length < 2 ||
        payload.phone.length < 6 || payload.address_line.length < 5 ||
        payload.district.length < 2 || payload.division.length < 2) {
      setErrorMessage("Enter a valid name, phone number, and complete address.");
      setSaving(false); return;
    }
    try {
      const supabase = createBrowserSupabaseClient();
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) {
        router.replace("/auth/customer-login?next=/account/addresses"); return;
      }
      if (payload.is_default) {
        const { error: clearError } = await supabase.from("customer_addresses")
          .update({ is_default: false }).eq("user_id", authData.user.id);
        if (clearError) throw clearError;
      }
      const result = editingId
        ? await supabase.from("customer_addresses").update(payload)
            .eq("id", editingId).eq("user_id", authData.user.id)
        : await supabase.from("customer_addresses").insert({ ...payload, user_id: authData.user.id });
      if (result.error) throw result.error;
      await loadAddresses(); resetForm(); setMessage("Address saved.");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Could not save the address.");
    } finally { setSaving(false); }
  }

  async function deleteAddress(id: string) {
    if (!window.confirm("Are you sure you want to delete this address?")) return;
    setErrorMessage(""); setMessage("");
    try {
      const supabase = createBrowserSupabaseClient();
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) {
        router.replace("/auth/customer-login?next=/account/addresses"); return;
      }
      const { error } = await supabase.from("customer_addresses").delete()
        .eq("id", id).eq("user_id", authData.user.id);
      if (error) throw error;
      await loadAddresses(); if (editingId === id) resetForm();
      setMessage("Address deleted.");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Could not delete the address.");
    }
  }

  return (
    <main className="addresses-page">
      <header className="header">
        <Link href="/" className="brand">NEWEIX</Link>
        <Link href="/account" className="back">← Back to account</Link>
      </header>
      <section className="content">
        <p className="eyebrow">DELIVERY ADDRESSES</p>
        <h1>My addresses</h1>
        <p className="intro">Save and manage your delivery addresses. Only you can view addresses saved to your account.</p>
        {message && <p className="success" role="status">{message}</p>}
        {errorMessage && <p className="error" role="alert">{errorMessage}</p>}
        {loading ? <p role="status">Loading addresses…</p> : (
          <>
            <div className="address-list">
              {addresses.map((address) => (
                <article className="address-card" key={address.id}>
                  <div className="card-title"><strong>{address.label}</strong>{address.is_default && <span>Default</span>}</div>
                  <p>{address.recipient_name} · {address.phone}</p>
                  <p>{address.address_line}{address.area ? ", " + address.area : ""}{address.upazila ? ", " + address.upazila : ""}, {address.district}, {address.division}{address.postal_code ? " - " + address.postal_code : ""}</p>
                  <div className="actions">
                    <button type="button" className="text-button" onClick={() => beginEdit(address)}><Icon name="settings" size={15} /> Edit</button>
                    <button type="button" className="delete" onClick={() => void deleteAddress(address.id)}><Icon name="trash" size={15} /> Delete</button>
                  </div>
                </article>
              ))}
              {addresses.length === 0 && <p className="empty">You have not saved any addresses yet.</p>}
            </div>
            <form className="form" onSubmit={saveAddress}>
              <h2>{editingId ? "Edit address" : "Add a new address"}</h2>
              <label htmlFor="address-label">Address label</label>
              <select id="address-label" value={form.label} onChange={(event) => updateField("label", event.target.value)}>
                <option value="Home">Home</option><option value="Office">Office</option><option value="Other">Other</option>
              </select>
              <label htmlFor="recipient-name">Recipient name</label>
              <input id="recipient-name" required minLength={2} maxLength={100} autoComplete="name" value={form.recipient_name} onChange={(event) => updateField("recipient_name", event.target.value)} />
              <label htmlFor="address-phone">Mobile number</label>
              <input id="address-phone" required type="tel" minLength={6} maxLength={30} autoComplete="tel" value={form.phone} onChange={(event) => updateField("phone", event.target.value)} />
              <label htmlFor="address-line">Full address, including house, road, and village</label>
              <textarea id="address-line" required minLength={5} maxLength={500} autoComplete="street-address" value={form.address_line} onChange={(event) => updateField("address_line", event.target.value)} />
              <label htmlFor="address-area">Area (optional)</label>
              <input id="address-area" maxLength={120} value={form.area} onChange={(event) => updateField("area", event.target.value)} />
              <label htmlFor="address-upazila">Upazila / police station</label>
              <input id="address-upazila" maxLength={120} value={form.upazila} onChange={(event) => updateField("upazila", event.target.value)} />
              <label htmlFor="address-district">District</label>
              <input id="address-district" required minLength={2} maxLength={120} value={form.district} onChange={(event) => updateField("district", event.target.value)} />
              <label htmlFor="address-division">Division</label>
              <input id="address-division" required minLength={2} maxLength={120} value={form.division} onChange={(event) => updateField("division", event.target.value)} />
              <label htmlFor="address-postal">Postal code (optional)</label>
              <input id="address-postal" maxLength={20} autoComplete="postal-code" value={form.postal_code} onChange={(event) => updateField("postal_code", event.target.value)} />
              <label className="default-row">
                <input type="checkbox" checked={form.is_default} onChange={(event) => updateField("is_default", event.target.checked)} />
                <span>Set as default delivery address</span>
              </label>
              <div className="form-actions">
                <button type="submit" disabled={saving}><><Icon name={saving ? "refresh" : "check"} size={16} /> {saving ? "Saving…" : editingId ? "Save changes" : "Save address"}</></button>
                {editingId && <button type="button" className="cancel" onClick={resetForm}><Icon name="close" size={15} /> Cancel</button>}
              </div>
            </form>
          </>
        )}
      </section>
      <style jsx>{`
        .addresses-page { min-height:100vh; padding:0 18px 56px; background:var(--bg); color:var(--ink); }
        .header { max-width:900px; min-height:68px; margin:auto; display:flex; align-items:center; justify-content:space-between; gap:16px; border-bottom:1px solid var(--border); }
        .brand { color:var(--primary); font-weight:800; letter-spacing:2px; text-decoration:none; }
        .back { color:var(--muted); font-size:14px; text-decoration:none; }
        .content { box-sizing:border-box; max-width:760px; margin:34px auto; }
        .eyebrow { color:var(--primary); font-size:12px; font-weight:700; letter-spacing:2px; }
        h1 { margin:8px 0; font-size:30px; }
        .intro { color:var(--muted); line-height:1.7; }
        .address-list { display:grid; gap:12px; margin:24px 0; }
        .address-card,.form { padding:20px; border:1px solid var(--border); border-radius:14px; background:white; }
        .card-title { display:flex; align-items:center; justify-content:space-between; gap:10px; }
        .card-title span { padding:4px 8px; border-radius:20px; background:var(--brand-lime-soft); color:var(--success); font-size:12px; }
        .address-card p { color:var(--muted); line-height:1.6; overflow-wrap:anywhere; }
        .actions { display:flex; gap:18px; }
        .text-button,.delete { padding:0; border:0; background:none; color:var(--primary); font:inherit; cursor:pointer; }
        .delete { color:var(--danger); }
        .empty { padding:18px; border:1px dashed var(--border); border-radius:12px; color:var(--muted); }
        .form { display:grid; gap:10px; }
        h2 { margin:0 0 8px; font-size:20px; }
        label { margin-top:7px; font-size:14px; font-weight:600; }
        input:not([type=checkbox]),select,textarea { box-sizing:border-box; width:100%; min-height:46px; padding:11px 12px; border:1px solid var(--border); border-radius:9px; background:white; color:var(--ink); font:inherit; }
        textarea { min-height:90px; resize:vertical; }
        .default-row { display:flex; align-items:center; gap:10px; font-weight:500; }
        .default-row input { width:18px; height:18px; }
        .form-actions { display:flex; gap:10px; margin-top:10px; }
        .form-actions button { flex:1; min-height:46px; padding:10px; border:0; border-radius:9px; background:var(--primary); color:white; font:inherit; font-weight:700; cursor:pointer; }
        .form-actions button:disabled { opacity:.6; cursor:wait; }
        .form-actions .cancel { background:var(--surface-raised); color:var(--ink); }
        .success { color:var(--success); } .error { color:var(--danger); }
        @media(max-width:520px) { .content { margin-top:22px; } .address-card,.form { padding:16px; } }
      `}</style>
    </main>
  );
}

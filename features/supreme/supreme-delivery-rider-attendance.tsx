"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Rider = { id: string; rider_code: string; full_name: string; phone: string; is_active: boolean };
type Status = "present" | "late" | "half_day" | "absent" | "leave";
type RecordRow = {
  id: string; rider_id: string; work_date: string; attendance_status: Status;
  check_in_at: string | null; check_out_at: string | null; notes: string | null;
  rider: Rider | null;
};
const statuses: { value: Status; label: string }[] = [
  { value: "present", label: "Present" },
  { value: "late", label: "Late" },
  { value: "half_day", label: "Half day" },
  { value: "absent", label: "Absent" },
  { value: "leave", label: "Leave" },
];
const todayDhaka = () => new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date());
const localTime = (value: string | null) => value
  ? new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dhaka", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value))
  : "—";
const dateTime = (date: string, time: string) => time ? `${date}T${time}:00+06:00` : null;
const moneyStatus: Record<Status, string> = {
  present: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
  late: "border-amber-400/30 bg-amber-400/10 text-amber-200",
  half_day: "border-sky-400/30 bg-sky-400/10 text-sky-200",
  absent: "border-rose-400/30 bg-rose-400/10 text-rose-200",
  leave: "border-violet-400/30 bg-violet-400/10 text-violet-200",
};
export default function SupremeDeliveryRiderAttendance() {
  const today = useMemo(todayDhaka, []);
  const [riders, setRiders] = useState<Rider[]>([]);
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [counts, setCounts] = useState<Record<Status, number>>({ present: 0, late: 0, half_day: 0, absent: 0, leave: 0 });
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [riderId, setRiderId] = useState("");
  const [workDate, setWorkDate] = useState(today);
  const [status, setStatus] = useState<Status>("present");
  const [checkIn, setCheckIn] = useState("09:00");
  const [checkOut, setCheckOut] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const requiresTime = status === "present" || status === "late" || status === "half_day";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({ from, to });
      const response = await fetch(`/api/supreme/delivery-rider-attendance?${query.toString()}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not load attendance.");
      setRiders(payload.riders ?? []);
      setRecords(payload.records ?? []);
      setCounts(payload.counts ?? { present: 0, late: 0, half_day: 0, absent: 0, leave: 0 });
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load attendance.");
    } finally {
      setLoading(false);
    }
  }, [from, to]);
  useEffect(() => { void load(); }, [load]);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/supreme/delivery-rider-attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "record_attendance", rider_id: riderId, work_date: workDate,
          attendance_status: status,
          check_in_at: requiresTime ? dateTime(workDate, checkIn) : null,
          check_out_at: requiresTime ? dateTime(workDate, checkOut) : null,
          notes: notes.trim() || null,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not save attendance.");
      setNotice("Attendance record saved.");
      if (workDate < from || workDate > to) { setFrom(workDate); setTo(workDate); }
      else await load();
      setNotes("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save attendance.");
    } finally { setSaving(false); }
  }

  const activeRiders = riders.filter((rider) => rider.is_active);
  return (
    <main className="mx-auto w-full max-w-6xl space-y-5 p-4 pb-24 text-white sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-300">Supreme · Own Delivery</p>
          <h1 className="mt-1 text-2xl font-bold sm:text-3xl">Rider Attendance</h1>
          <p className="mt-1 text-sm text-slate-400">Daily check-in, check-out and attendance records for NEWEIX delivery riders.</p>
        </div>
        <a href="/supreme/delivery-riders" className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:border-amber-300/60">Rider management</a>
      </header>

      {error && <p role="alert" className="rounded-xl border border-rose-500/40 bg-rose-950/40 p-3 text-sm text-rose-200">{error}</p>}
      {notice && <p role="status" className="rounded-xl border border-emerald-500/40 bg-emerald-950/40 p-3 text-sm text-emerald-200">{notice}</p>}

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {statuses.map((item) => (
          <article key={item.value} className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
            <p className="text-xs text-slate-400">{item.label}</p>
            <p className="mt-2 text-2xl font-bold">{counts[item.value] ?? 0}</p>
          </article>
        ))}
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-950 p-4 sm:p-5">
        <div className="mb-4">
          <h2 className="text-lg font-bold">Record attendance</h2>
          <p className="mt-1 text-xs text-slate-400">One attendance record per rider per Bangladesh-local date. Saving again updates that day’s record.</p>
        </div>
        <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm text-slate-300">Rider
            <select required value={riderId} onChange={(event) => setRiderId(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 p-3">
              <option value="">Select a rider</option>
              {activeRiders.map((rider) => <option key={rider.id} value={rider.id}>{rider.full_name} · {rider.rider_code}</option>)}
            </select>
          </label>
          <label className="text-sm text-slate-300">Work date
            <input required type="date" max={today} value={workDate} onChange={(event) => setWorkDate(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 p-3" />
          </label>
          <label className="text-sm text-slate-300">Attendance status
            <select value={status} onChange={(event) => setStatus(event.target.value as Status)} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 p-3">
              {statuses.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          {requiresTime && <>
            <label className="text-sm text-slate-300">Check-in time (Bangladesh)
              <input required type="time" value={checkIn} onChange={(event) => setCheckIn(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 p-3" />
            </label>
            <label className="text-sm text-slate-300">Check-out time (optional)
              <input type="time" value={checkOut} onChange={(event) => setCheckOut(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 p-3" />
            </label>
          </>}
          <label className="text-sm text-slate-300 sm:col-span-2">Note (optional)
            <input maxLength={500} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Reason for late arrival, leave note, etc." className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 p-3" />
          </label>
          <button disabled={saving || !activeRiders.length} className="rounded-xl bg-amber-300 px-4 py-3 font-bold text-slate-950 disabled:opacity-50 sm:col-span-2">
            {saving ? "Saving..." : "Save attendance"}
          </button>
        </form>
        {!activeRiders.length && <p className="mt-3 text-sm text-amber-200">Add an active rider before recording attendance.</p>}
      </section>

      <section className="space-y-4 rounded-2xl border border-slate-800 bg-slate-950 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h2 className="text-lg font-bold">Attendance history</h2><p className="mt-1 text-xs text-slate-400">Records are grouped by the selected Bangladesh-local date range.</p></div>
          <button type="button" onClick={() => void load()} disabled={loading} className="rounded-xl border border-slate-700 px-3 py-2 text-sm disabled:opacity-50">Refresh</button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm text-slate-300">From
            <input type="date" max={to} value={from} onChange={(event) => setFrom(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 p-3" />
          </label>
          <label className="text-sm text-slate-300">To
            <input type="date" min={from} max={today} value={to} onChange={(event) => setTo(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 p-3" />
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-slate-900 text-xs text-slate-400"><tr>
              <th className="p-3">Date</th><th className="p-3">Rider</th><th className="p-3">Status</th>
              <th className="p-3">Check-in</th><th className="p-3">Check-out</th><th className="p-3">Note</th>
            </tr></thead>
            <tbody>
              {records.map((record) => <tr key={record.id} className="border-t border-slate-800">
                <td className="p-3 whitespace-nowrap">{record.work_date}</td>
                <td className="p-3"><span className="font-semibold">{record.rider?.full_name ?? "Unknown rider"}</span><span className="ml-2 text-xs text-slate-500">{record.rider?.rider_code ?? ""}</span></td>
                <td className="p-3"><span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${moneyStatus[record.attendance_status]}`}>{statuses.find((item) => item.value === record.attendance_status)?.label}</span></td>
                <td className="p-3">{localTime(record.check_in_at)}</td><td className="p-3">{localTime(record.check_out_at)}</td><td className="max-w-[220px] truncate p-3 text-slate-400">{record.notes || "—"}</td>
              </tr>)}
            </tbody>
          </table>
          {!loading && records.length === 0 && <p className="p-5 text-center text-sm text-slate-400">No attendance records for this period.</p>}
          {loading && <p className="p-5 text-center text-sm text-slate-400">Loading attendance...</p>}
        </div>
        <p className="text-xs text-slate-500">Attendance is entered manually by the Supreme account. This phase does not use rider GPS, a rider login, or automatic clock-in.</p>
      </section>
    </main>
  );
}

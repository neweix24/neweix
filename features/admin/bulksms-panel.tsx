"use client";

import { useState } from "react";
import Icon from "@/components/ui/icon";

type State = "idle" | "loading" | "success" | "error";

export default function BulkSmsPanel() {
  const [state, setState] = useState<State>("idle");
  const [message, setMessage] = useState("BulkSMSBD has not been checked yet.");
  const [providerResponse, setProviderResponse] = useState("");
  const [checkedAt, setCheckedAt] = useState("");

  async function checkBalance() {
    setState("loading");
    setMessage("Checking the provider balance endpoint…");
    setProviderResponse("");
    try {
      const response = await fetch("/api/admin/bulksms", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "BulkSMSBD balance check failed.");
      setProviderResponse(typeof result.providerResponse === "string" ? result.providerResponse : "");
      setCheckedAt(typeof result.checkedAt === "string" ? result.checkedAt : "");
      setMessage(result.message || "BulkSMSBD responded successfully.");
      setState("success");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "BulkSMSBD connection failed.");
      setState("error");
    }
  }

  return (
    <section className="rounded-2xl border p-5 sm:p-6" style={{ borderColor: "var(--border)", background: "var(--surface)", boxShadow: "var(--shadow)" }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black tracking-[.16em]" style={{ color: "var(--primary)" }}>TRANSACTIONAL MESSAGING</p>
          <h2 className="mt-1 text-xl font-black">BulkSMSBD</h2>
          <p className="mt-1 max-w-xl text-sm leading-6" style={{ color: "var(--muted)" }}>Check whether the server-side API credentials can retrieve your provider balance. No SMS is sent by this test.</p>
        </div>
        <span className="grid h-11 w-11 place-items-center rounded-xl" style={{ background: "var(--brand-lime-soft)", color: "var(--primary)" }}><Icon name="shield" size={21} /></span>
      </div>
      <button type="button" onClick={() => void checkBalance()} disabled={state === "loading"} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-extrabold disabled:opacity-60" style={{ background: "var(--primary)", color: "#fff" }}>
        <Icon name="refresh" size={16} /> {state === "loading" ? "Checking…" : "Check provider balance"}
      </button>
      <p role="status" className="mt-3 text-sm" style={{ color: state === "error" ? "#a13e3e" : state === "success" ? "#28764b" : "var(--muted)" }}>{message}</p>
      {providerResponse && <div className="mt-3 rounded-xl border p-3" style={{ borderColor: "var(--border)", background: "var(--surface-soft)" }}><p className="text-xs font-bold" style={{ color: "var(--muted)" }}>Provider response</p><pre className="mt-2 whitespace-pre-wrap break-words text-sm">{providerResponse}</pre></div>}
      {checkedAt && <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>Checked: {new Date(checkedAt).toLocaleString("en-BD")}</p>}
      <p className="mt-4 border-t pt-3 text-xs leading-5" style={{ borderColor: "var(--border)", color: "var(--muted)" }}>A successful balance response confirms API connectivity only. Check BulkSMSBD delivery reports to confirm whether OTP or transactional messages reached a handset.</p>
    </section>
  );
}

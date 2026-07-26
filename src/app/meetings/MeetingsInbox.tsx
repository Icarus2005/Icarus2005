"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText, Loader2, Plus, RefreshCw, Sparkles, Trash2, X } from "lucide-react";
import ProductBadge from "@/components/ProductBadge";
import { TRIAGE_COLORS, TRIAGE_STATUSES, TRANSCRIPT_SOURCES } from "@/lib/proposals/stages";
import { fmtDate } from "@/lib/format";

type Transcript = {
  id: string;
  title: string;
  source: string;
  meetingDate: string;
  triageStatus: string;
  triageScore: number | null;
  triageReason: string | null;
  detectedProduct: string | null;
  account: { id: string; name: string } | null;
  proposals: { id: string; stage: string }[];
};

export default function MeetingsInbox() {
  const router = useRouter();
  const [items, setItems] = useState<Transcript[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await fetch(`/api/meetings${filter ? `?status=${filter}` : ""}`);
      if (!res.ok) throw new Error();
      setItems(await res.json());
    } catch {
      setError("Could not load meetings.");
    }
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  async function addTranscript(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const data = Object.fromEntries(new FormData(e.currentTarget));
    const res = await fetch("/api/meetings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      const created = await res.json();
      setShowForm(false);
      // Triage straight away so the row lands decision-ready.
      await fetch(`/api/meetings/${created.id}`, { method: "POST" }).catch(() => {});
      await load();
    } else {
      const err = await res.json().catch(() => null);
      setError(err?.error ?? "Could not save the transcript.");
    }
    setSaving(false);
  }

  async function retriage(id: string) {
    setBusyId(id);
    setError("");
    const res = await fetch(`/api/meetings/${id}`, { method: "POST" });
    if (!res.ok) setError("Triage failed.");
    await load();
    setBusyId(null);
  }

  async function createProposal(t: Transcript) {
    setBusyId(t.id);
    setError("");
    const res = await fetch("/api/proposals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcriptId: t.id }),
    });
    if (res.ok) {
      const proposal = await res.json();
      router.push(`/proposals/${proposal.id}`);
      return;
    }
    setError("Could not create the proposal.");
    setBusyId(null);
  }

  async function remove(id: string) {
    if (!confirm("Delete this transcript? Any proposal already created stays.")) return;
    setBusyId(id);
    await fetch(`/api/meetings/${id}`, { method: "DELETE" });
    await load();
    setBusyId(null);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div className="flex gap-2 flex-wrap">
          {[
            ["", "All"],
            ["QUALIFIED", "Qualified"],
            ["PENDING", "Pending"],
            ["SKIPPED", "Skipped"],
          ].map(([k, label]) => (
            <button
              key={label}
              onClick={() => setFilter(k)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filter === k
                  ? "bg-brand-600 text-white"
                  : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <button onClick={() => setShowForm((v) => !v)} className="btn-primary">
          <Plus size={16} aria-hidden /> Add Transcript
        </button>
      </div>

      {error && (
        <div role="alert" className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg mb-4">
          {error}
        </div>
      )}

      {showForm && (
        <form onSubmit={addTranscript} className="card p-6 mb-6 space-y-4 border-brand-200 ring-1 ring-brand-100">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Add a call transcript</h2>
            <button type="button" onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600">
              <X size={18} aria-hidden />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <label className="label" htmlFor="mt-title">Meeting title *</label>
              <input id="mt-title" name="title" required className="input" placeholder="Discovery call — Emaar Malls" />
            </div>
            <div>
              <label className="label" htmlFor="mt-date">Meeting date</label>
              <input id="mt-date" name="meetingDate" type="date" className="input" defaultValue={new Date().toISOString().split("T")[0]} />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="mt-text">Transcript *</label>
            <textarea
              id="mt-text"
              name="rawTranscript"
              required
              rows={8}
              className="input resize-y font-mono text-xs"
              placeholder="Paste the call transcript here…"
            />
          </div>
          <div className="flex gap-3">
            <button type="submit" disabled={saving} className="btn-primary disabled:opacity-60">
              {saving ? "Saving…" : "Save & triage"}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
          </div>
        </form>
      )}

      {loading && <div className="card p-8 text-center text-gray-400">Loading meetings…</div>}

      {!loading && items.length === 0 && (
        <div className="card p-10 text-center">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-brand-50 flex items-center justify-center">
            <FileText size={22} className="text-brand-500" aria-hidden />
          </div>
          <p className="text-gray-600 font-medium">No meeting transcripts yet</p>
          <p className="text-sm text-gray-400 mt-1 max-w-md mx-auto">
            Paste one manually, or point your meeting recorder&apos;s webhook at{" "}
            <code className="text-xs bg-gray-50 px-1.5 py-0.5 rounded">/api/meetings/ingest</code>.
          </p>
        </div>
      )}

      <div className="space-y-2">
        {items.map((t) => {
          const busy = busyId === t.id;
          const hasProposal = t.proposals.length > 0;
          return (
            <div key={t.id} className="card p-4 flex items-start gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium text-gray-900">{t.title}</p>
                  <span className={`badge ${TRIAGE_COLORS[t.triageStatus] ?? "bg-gray-100 text-gray-600"}`}>
                    {TRIAGE_STATUSES[t.triageStatus] ?? t.triageStatus}
                  </span>
                  {t.triageScore != null && (
                    <span className="text-xs text-gray-400">score {t.triageScore}</span>
                  )}
                  {t.detectedProduct && <ProductBadge product={t.detectedProduct} />}
                </div>
                <p className="text-sm text-gray-500 mt-1">
                  {fmtDate(t.meetingDate)} · {TRANSCRIPT_SOURCES[t.source] ?? t.source}
                  {t.account ? ` · ${t.account.name}` : ""}
                </p>
                {t.triageReason && (
                  <p className="text-xs text-gray-400 mt-1 italic">{t.triageReason}</p>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {hasProposal ? (
                  <Link href={`/proposals/${t.proposals[0].id}`} className="btn-secondary text-xs px-3 py-1.5">
                    View proposal
                  </Link>
                ) : (
                  <button
                    onClick={() => createProposal(t)}
                    disabled={busy || t.triageStatus !== "QUALIFIED"}
                    title={
                      t.triageStatus === "QUALIFIED"
                        ? "Start a proposal from this call"
                        : "Only qualified calls can start a proposal"
                    }
                    className="btn-primary text-xs px-3 py-1.5 disabled:opacity-40"
                  >
                    {busy ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Sparkles size={13} aria-hidden />}
                    Create proposal
                  </button>
                )}
                <button
                  onClick={() => retriage(t.id)}
                  disabled={busy}
                  title="Re-run triage"
                  aria-label="Re-run triage"
                  className="p-2 text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors"
                >
                  <RefreshCw size={14} aria-hidden />
                </button>
                <button
                  onClick={() => remove(t.id)}
                  disabled={busy}
                  title="Delete transcript"
                  aria-label="Delete transcript"
                  className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <Trash2 size={14} aria-hidden />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

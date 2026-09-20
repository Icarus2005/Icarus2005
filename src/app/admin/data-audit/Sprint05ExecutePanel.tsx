"use client";

import { useState } from "react";
import { AlertTriangle, Play, Search } from "lucide-react";

type StepReport = { category: string; key: string; status: "applied" | "already_applied" | "skipped" | "excluded" | "aborted"; detail: string };

// Narrowly scoped preview + guarded execute for the Sprint 05 categories the
// CRM owner explicitly approved (see src/lib/sprint05Execute.ts for the exact
// scope and exclusions). Same two-step confirmation pattern as Sprint 03/04.
export default function Sprint05ExecutePanel() {
  const [preview, setPreview] = useState<unknown>(null);
  const [report, setReport] = useState<StepReport[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runPreview() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/sprint05execute");
      if (!res.ok) throw new Error(`Preview failed: HTTP ${res.status}`);
      setPreview(await res.json());
      setReport(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function runExecute() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/sprint05execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "EXECUTE_SPRINT_05_APPROVED_SCOPE" }),
      });
      if (!res.ok) throw new Error(`Execute failed: HTTP ${res.status}`);
      const data = await res.json();
      setReport(data.report);
      setConfirming(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card p-6 border-2 border-amber-200">
      <h2 className="text-sm font-semibold text-gray-700 mb-1">Sprint 05 — Approved-Scope Execution</h2>
      <p className="text-xs text-gray-500 mb-4">
        Narrowly scoped to what was explicitly approved: 21 Lead→primary-contact links (Adrian Roodt / John Bevan
        excluded), 26 AccountProduct creates (Travelport / dnata Travel excluded), 19 Contact sourceType/sourceDetail
        backfills (Adrian / John excluded, relationshipStrength and acquisitionPath never touched), and 3 Opportunity
        primary-contact assignments (Sabre→Ishaq Khattak, Tourism 365→Rebin Baby, Doha Oasis→Muhammad Nasir; Abu Dhabi
        Airports untouched). Task due dates: zero writes. Idempotent, re-verifies every row immediately before writing.
      </p>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2 mb-3">
          <AlertTriangle size={13} /> {error}
        </div>
      )}

      <div className="flex gap-2 mb-4">
        <button
          onClick={runPreview}
          disabled={loading}
          className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-md border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 disabled:opacity-50"
        >
          <Search size={13} /> Preview approved scope (read-only)
        </button>
        {preview != null && !confirming && (
          <button
            onClick={() => setConfirming(true)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-md border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-800 disabled:opacity-50"
          >
            <Play size={13} /> Execute approved scope…
          </button>
        )}
        {confirming && (
          <button
            onClick={runExecute}
            disabled={loading}
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-md border border-red-300 bg-red-50 hover:bg-red-100 text-red-700 disabled:opacity-50"
          >
            Confirm — write to production
          </button>
        )}
      </div>

      {preview != null && (
        <div className="mb-4">
          <p className="text-xs font-semibold text-gray-500 mb-1">Execution preview</p>
          <pre className="text-[11px] bg-gray-50 border border-gray-200 rounded-lg p-3 overflow-auto max-h-[32rem]">
            {JSON.stringify(preview, null, 2)}
          </pre>
        </div>
      )}

      {report != null && (
        <div>
          <p className="text-xs font-semibold text-gray-500 mb-1">Execution report</p>
          <ul className="text-xs space-y-1">
            {report.map((r, i) => (
              <li key={i} className="flex items-start gap-2">
                <span
                  className={`shrink-0 font-semibold ${
                    r.status === "applied"
                      ? "text-green-600"
                      : r.status === "already_applied" || r.status === "excluded"
                        ? "text-gray-400"
                        : r.status === "aborted"
                          ? "text-red-600"
                          : "text-amber-600"
                  }`}
                >
                  [{r.category}:{r.status}]
                </span>
                <span className="text-gray-700">{r.key} — {r.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

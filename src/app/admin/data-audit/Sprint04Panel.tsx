"use client";

import { useState } from "react";
import { AlertTriangle, Play, Search } from "lucide-react";

type StepReport = { step: string; status: "applied" | "already_applied" | "skipped"; detail: string };

// Same two-step, explicit-confirmation pattern as Sprint03Panel: Preview
// (GET) never writes anything; Execute requires a second, separately
// labeled confirm click plus a body token.
export default function Sprint04Panel() {
  const [preview, setPreview] = useState<unknown>(null);
  const [report, setReport] = useState<StepReport[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runPreview() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/sprint04");
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
      const res = await fetch("/api/admin/sprint04", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "EXECUTE_SPRINT_04" }),
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
    <div className="card p-6">
      <h2 className="text-sm font-semibold text-gray-700 mb-1">Sprint 04 — Controlled ATM Import</h2>
      <p className="text-xs text-gray-500 mb-4">
        Verified ATM/post-ATM contacts: Rebin Baby, Yara El Dehni, Roger Mosoti, Srushti Hatwar, Christina Reynolds, Khaled
        Amer, Balamurugan T, Mikin Ajwani, Wahid Khashaba, Olga Grigorieva, Abir Abidi, Bernard Kamau, Adrian Roodt
        (report-only), Konstantinos Panagiotakis, Bhaji Bhadran, Pablo Rojas Gomez, Emil Petrov. Idempotent — exact-name
        matching only, no fuzzy duplicates, zero historical Activities.
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
          <Search size={13} /> Preview (read-only)
        </button>
        {preview != null && !confirming && (
          <button
            onClick={() => setConfirming(true)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-md border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-800 disabled:opacity-50"
          >
            <Play size={13} /> Execute Sprint 04…
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
          <p className="text-xs font-semibold text-gray-500 mb-1">Preview</p>
          <pre className="text-[11px] bg-gray-50 border border-gray-200 rounded-lg p-3 overflow-auto max-h-96">
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
                    r.status === "applied" ? "text-green-600" : r.status === "already_applied" ? "text-gray-400" : "text-amber-600"
                  }`}
                >
                  [{r.status}]
                </span>
                <span className="text-gray-700">{r.step} — {r.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

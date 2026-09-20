"use client";

import { useState } from "react";
import { AlertTriangle, Search } from "lucide-react";

// Read-only preview panel. Deliberately no Execute button, no confirm flow —
// there is no write endpoint behind /api/admin/sprint05 to call. Sprint 05
// stays preview-only until the CRM owner approves individual categories.
export default function Sprint05Panel() {
  const [preview, setPreview] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runPreview() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/sprint05");
      if (!res.ok) throw new Error(`Preview failed: HTTP ${res.status}`);
      setPreview(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card p-6">
      <h2 className="text-sm font-semibold text-gray-700 mb-1">Sprint 05 — CRM Hygiene &amp; Relationship Backfill (preview only)</h2>
      <p className="text-xs text-gray-500 mb-4">
        Lead→primary-contact backfill, Account↔Product backfill, Contact provenance/relationshipStrength backfill,
        Opportunity primary-contact human review, and Task due-date review. Read-only — no execute action exists yet.
      </p>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2 mb-3">
          <AlertTriangle size={13} /> {error}
        </div>
      )}

      <button
        onClick={runPreview}
        disabled={loading}
        className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-md border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 disabled:opacity-50 mb-4"
      >
        <Search size={13} /> Preview (read-only)
      </button>

      {preview != null && (
        <pre className="text-[11px] bg-gray-50 border border-gray-200 rounded-lg p-3 overflow-auto max-h-[32rem]">
          {JSON.stringify(preview, null, 2)}
        </pre>
      )}
    </div>
  );
}

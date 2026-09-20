"use client";

import { useState } from "react";
import { AlertTriangle, Search } from "lucide-react";

// Read-only preview panel — no execute action exists yet. Sprint 06A stops
// after the live production preview until the CRM owner explicitly approves
// the 15 internal due-date assignments.
export default function Sprint06APanel() {
  const [preview, setPreview] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runPreview() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/sprint06a");
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
      <h2 className="text-sm font-semibold text-gray-700 mb-1">Sprint 06A — Immediate Follow-Up Deadlines (preview only)</h2>
      <p className="text-xs text-gray-500 mb-4">
        Proposes internal Task.dueDate values (7 tasks → 20 Sep 2026, 8 tasks → 21 Sep 2026, Asia/Dubai) for the 15
        currently-undated open tasks. Matched by exact task title. Read-only — no execute action exists yet.
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

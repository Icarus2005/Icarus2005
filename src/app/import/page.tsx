"use client";

import { useState, useRef } from "react";
import Papa from "papaparse";

// ─── Template definitions ────────────────────────────────────────────────────

const TEMPLATES = {
  accounts: {
    label: "Accounts",
    endpoint: "/api/import/accounts",
    columns: ["name", "country", "sector", "industry", "size", "website", "description"],
    notes: [
      "name — required",
      "country — UAE | SAUDI_ARABIA | QATAR | KUWAIT | BAHRAIN | OMAN | OTHER  (default: UAE)",
      "sector — GOVERNMENT | SEMI_GOVERNMENT | PRIVATE  (default: PRIVATE)",
      "size — SMALL | MEDIUM | LARGE | ENTERPRISE",
    ],
    sample: [
      {
        name: "Emaar Properties",
        country: "UAE",
        sector: "PRIVATE",
        industry: "Real Estate",
        size: "ENTERPRISE",
        website: "https://emaar.com",
        description: "Leading real estate developer",
      },
      {
        name: "Saudi Tourism Authority",
        country: "SAUDI_ARABIA",
        sector: "GOVERNMENT",
        industry: "Tourism",
        size: "LARGE",
        website: "",
        description: "",
      },
    ],
  },
  contacts: {
    label: "Contacts",
    endpoint: "/api/import/contacts",
    columns: ["firstName", "lastName", "accountName", "email", "phone", "title", "role"],
    notes: [
      "firstName, lastName — required",
      "accountName — must exactly match an account already in the CRM",
      "role — DECISION_MAKER | INFLUENCER | CHAMPION | BLOCKER | OTHER",
    ],
    sample: [
      {
        firstName: "Ahmed",
        lastName: "Al-Mansouri",
        accountName: "Emaar Properties",
        email: "ahmed@emaar.com",
        phone: "+971-50-000-0000",
        title: "Head of Strategy",
        role: "DECISION_MAKER",
      },
    ],
  },
  opportunities: {
    label: "Opportunities",
    endpoint: "/api/import/opportunities",
    columns: ["name", "accountName", "stage", "type", "value", "probability", "expectedCloseDate", "notes"],
    notes: [
      "name — required",
      "accountName — must exactly match an account already in the CRM",
      "stage — LEAD | QUALIFIED | PROPOSAL | NEGOTIATION | CLOSED_WON | CLOSED_LOST  (default: LEAD)",
      "type — DATA_PRODUCT | CONSULTING | BOTH  (default: DATA_PRODUCT)",
      "value — numeric, e.g. 50000",
      "probability — 0–100",
      "expectedCloseDate — YYYY-MM-DD",
    ],
    sample: [
      {
        name: "Mobility Data Subscription",
        accountName: "Emaar Properties",
        stage: "PROPOSAL",
        type: "DATA_PRODUCT",
        value: "120000",
        probability: "60",
        expectedCloseDate: "2026-06-30",
        notes: "Annual subscription for footfall insights",
      },
    ],
  },
} as const;

type TabKey = keyof typeof TEMPLATES;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function downloadTemplate(tab: TabKey) {
  const t = TEMPLATES[tab];
  const csv = Papa.unparse([t.columns, ...t.sample.map((r) => t.columns.map((c) => (r as Record<string, string>)[c] ?? ""))]);
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `template_${tab}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ImportPage() {
  const [tab, setTab] = useState<TabKey>("accounts");
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [fileName, setFileName] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ created: number; skipped: number; errors: string[] } | null>(null);
  const [parseError, setParseError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const template = TEMPLATES[tab];

  function switchTab(t: TabKey) {
    setTab(t);
    setRows([]);
    setFileName("");
    setResult(null);
    setParseError("");
    if (fileRef.current) fileRef.current.value = "";
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    setParseError("");

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
      complete(res) {
        if (res.errors.length > 0 && res.data.length === 0) {
          setParseError("Could not parse CSV. Check the file format.");
          setRows([]);
          return;
        }
        setRows(res.data);
      },
      error() {
        setParseError("Failed to read the file.");
      },
    });
  }

  async function handleImport() {
    if (rows.length === 0) return;
    setImporting(true);
    setResult(null);
    try {
      const res = await fetch(template.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rows),
      });
      const data = await res.json();
      setResult(data);
      setRows([]);
      setFileName("");
      if (fileRef.current) fileRef.current.value = "";
    } catch {
      setResult({ created: 0, skipped: rows.length, errors: ["Network error — please try again."] });
    }
    setImporting(false);
  }

  const previewRows = rows.slice(0, 5);

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Import from CSV</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Bulk import your pipeline data. Import Accounts first, then Contacts, then Opportunities.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-xl w-fit">
        {(Object.keys(TEMPLATES) as TabKey[]).map((t, i) => (
          <button
            key={t}
            onClick={() => switchTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {i + 1}. {TEMPLATES[t].label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: instructions + template */}
        <div className="space-y-4">
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Column Reference</h2>
            <ul className="space-y-1.5">
              {template.notes.map((n, i) => (
                <li key={i} className="text-xs text-gray-600 leading-relaxed">
                  <span className="text-gray-400">·</span> {n}
                </li>
              ))}
            </ul>
          </div>

          <button
            onClick={() => downloadTemplate(tab)}
            className="btn-secondary w-full justify-center"
          >
            Download Template CSV
          </button>
        </div>

        {/* Right: upload + preview + import */}
        <div className="lg:col-span-2 space-y-4">
          {/* Upload */}
          <div className="card p-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Upload CSV</h2>
            <label className="block border-2 border-dashed border-gray-200 rounded-xl p-8 text-center cursor-pointer hover:border-brand-400 transition-colors">
              <input
                ref={fileRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleFile}
              />
              {fileName ? (
                <div>
                  <p className="text-sm font-medium text-brand-600">{fileName}</p>
                  <p className="text-xs text-gray-400 mt-1">{rows.length} rows parsed</p>
                </div>
              ) : (
                <div>
                  <p className="text-sm text-gray-500">Click to choose a CSV file</p>
                  <p className="text-xs text-gray-400 mt-1">or drag and drop</p>
                </div>
              )}
            </label>

            {parseError && (
              <p className="text-sm text-red-600 mt-2">{parseError}</p>
            )}
          </div>

          {/* Preview */}
          {rows.length > 0 && (
            <div className="card overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex justify-between items-center">
                <h2 className="text-sm font-semibold text-gray-700">
                  Preview{rows.length > 5 ? ` (first 5 of ${rows.length} rows)` : ` (${rows.length} rows)`}
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      {Object.keys(previewRows[0]).map((col) => (
                        <th key={col} className="px-3 py-2 text-left font-semibold text-gray-500 whitespace-nowrap">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {previewRows.map((row, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        {Object.values(row).map((val, j) => (
                          <td key={j} className="px-3 py-2 text-gray-600 max-w-[160px] truncate">
                            {val}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Import button */}
          {rows.length > 0 && (
            <button
              onClick={handleImport}
              disabled={importing}
              className="btn-primary w-full justify-center py-3"
            >
              {importing
                ? "Importing..."
                : `Import ${rows.length} ${template.label}`}
            </button>
          )}

          {/* Result */}
          {result && (
            <div className={`card p-5 border-l-4 ${result.created > 0 ? "border-green-500" : "border-yellow-500"}`}>
              <div className="flex gap-6 mb-3">
                <div>
                  <p className="text-xs text-gray-500">Imported</p>
                  <p className="text-2xl font-bold text-green-600">{result.created}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Skipped</p>
                  <p className="text-2xl font-bold text-yellow-600">{result.skipped}</p>
                </div>
              </div>
              {result.errors.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-1">Issues:</p>
                  <ul className="space-y-0.5">
                    {result.errors.map((e, i) => (
                      <li key={i} className="text-xs text-red-600">· {e}</li>
                    ))}
                  </ul>
                </div>
              )}
              {result.created > 0 && (
                <p className="text-xs text-gray-500 mt-2">
                  Done! View your{" "}
                  <a href={`/${tab}`} className="text-brand-600 hover:underline">
                    {template.label}
                  </a>{" "}
                  or continue to the next tab.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

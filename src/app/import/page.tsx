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

type TabKey = keyof typeof TEMPLATES | "pipeline";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function downloadTemplate(tab: keyof typeof TEMPLATES) {
  const t = TEMPLATES[tab];
  const csv = Papa.unparse([
    t.columns,
    ...t.sample.map((r) => t.columns.map((c) => (r as Record<string, string>)[c] ?? "")),
  ]);
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `template_${tab}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Pipeline Sheet importer ──────────────────────────────────────────────────

function PipelineImporter() {
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [fileName, setFileName] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{
    accounts: number;
    contacts: number;
    opportunities: number;
    skipped: number;
    errors: string[];
  } | null>(null);
  const [parseError, setParseError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    setParseError("");

    Papa.parse<Record<string, string>>(file, {
      // Skip the first row if it looks like a title (not a header)
      header: false,
      skipEmptyLines: true,
      complete(res) {
        const rawRows = res.data as string[][];
        if (rawRows.length < 2) {
          setParseError("File appears empty.");
          return;
        }
        // Find the header row: the first row containing "CLIENT"
        let headerIdx = 0;
        for (let i = 0; i < Math.min(5, rawRows.length); i++) {
          if (rawRows[i].some((cell) => cell?.trim().toUpperCase() === "CLIENT")) {
            headerIdx = i;
            break;
          }
        }
        const headers = rawRows[headerIdx].map((h) => h.trim());
        const dataRows = rawRows.slice(headerIdx + 1).map((row) => {
          const obj: Record<string, string> = {};
          headers.forEach((h, i) => { obj[h] = row[i] ?? ""; });
          return obj;
        });
        // Filter out completely empty rows
        const filtered = dataRows.filter((r) =>
          Object.values(r).some((v) => v.trim() !== "")
        );
        setRows(filtered);
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
      const res = await fetch("/api/import/pipeline", {
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
      setResult({ accounts: 0, contacts: 0, opportunities: 0, skipped: rows.length, errors: ["Network error — please try again."] });
    }
    setImporting(false);
  }

  const previewRows = rows.slice(0, 5);
  const previewHeaders = previewRows.length > 0 ? Object.keys(previewRows[0]) : [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Instructions */}
      <div className="space-y-4">
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">How it works</h2>
          <ul className="space-y-2 text-xs text-gray-600">
            <li className="flex gap-2"><span className="text-brand-500 font-bold">1.</span> Open your Excel pipeline sheet</li>
            <li className="flex gap-2"><span className="text-brand-500 font-bold">2.</span> Go to <strong>File → Save As → CSV (Comma delimited)</strong></li>
            <li className="flex gap-2"><span className="text-brand-500 font-bold">3.</span> Upload the CSV here</li>
            <li className="flex gap-2"><span className="text-brand-500 font-bold">4.</span> The CRM auto-creates Accounts + Contacts + Deals from each row</li>
          </ul>
        </div>

        <div className="card p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-2">Expected columns</h2>
          <div className="space-y-1">
            {[
              ["CLIENT", "→ Account name"],
              ["CLIENT NAME", "→ Contact person"],
              ["VALUE $", "→ Deal value"],
              ["PRIORITY", "→ 1=Negotiation, 2=Proposal, 3=Qualified"],
              ["Discussion", "→ Saved as deal notes"],
              ["Next Steps", "→ Saved as deal notes"],
              ["TYPE", "→ Channel (Direct, ESRI, etc.)"],
            ].map(([col, desc]) => (
              <div key={col} className="text-xs">
                <span className="font-mono bg-gray-100 px-1 rounded text-gray-700">{col}</span>
                <span className="text-gray-500 ml-1">{desc}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Upload + preview + import */}
      <div className="lg:col-span-2 space-y-4">
        <div className="card p-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Upload your pipeline CSV</h2>
          <label className="block border-2 border-dashed border-gray-200 rounded-xl p-8 text-center cursor-pointer hover:border-brand-400 transition-colors">
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
            {fileName ? (
              <div>
                <p className="text-sm font-medium text-brand-600">{fileName}</p>
                <p className="text-xs text-gray-400 mt-1">{rows.length} rows detected</p>
              </div>
            ) : (
              <div>
                <p className="text-sm text-gray-500">Click to choose your CSV file</p>
                <p className="text-xs text-gray-400 mt-1">Supports IRL MENAT pipeline format</p>
              </div>
            )}
          </label>
          {parseError && <p className="text-sm text-red-600 mt-2">{parseError}</p>}
        </div>

        {/* Preview */}
        {rows.length > 0 && (
          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-700">
                Preview{rows.length > 5 ? ` (first 5 of ${rows.length} rows)` : ` (${rows.length} rows)`}
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    {previewHeaders.map((col) => (
                      <th key={col} className="px-3 py-2 text-left font-semibold text-gray-500 whitespace-nowrap">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {previewRows.map((row, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      {previewHeaders.map((col) => (
                        <td key={col} className="px-3 py-2 text-gray-600 max-w-[140px] truncate">
                          {row[col]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {rows.length > 0 && (
          <button
            onClick={handleImport}
            disabled={importing}
            className="btn-primary w-full justify-center py-3"
          >
            {importing ? "Importing..." : `Import ${rows.length} pipeline rows`}
          </button>
        )}

        {result && (
          <div className={`card p-5 border-l-4 ${result.opportunities > 0 ? "border-green-500" : "border-yellow-500"}`}>
            <p className="text-sm font-semibold text-gray-700 mb-3">Import complete</p>
            <div className="flex gap-6 mb-3">
              {[
                { label: "Accounts", value: result.accounts, color: "text-brand-600" },
                { label: "Contacts", value: result.contacts, color: "text-purple-600" },
                { label: "Deals", value: result.opportunities, color: "text-green-600" },
                { label: "Skipped", value: result.skipped, color: "text-yellow-600" },
              ].map((s) => (
                <div key={s.label}>
                  <p className="text-xs text-gray-500">{s.label}</p>
                  <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                </div>
              ))}
            </div>
            {result.errors.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-1">Issues:</p>
                <ul className="space-y-0.5 max-h-40 overflow-y-auto">
                  {result.errors.map((e, i) => (
                    <li key={i} className="text-xs text-red-600">· {e}</li>
                  ))}
                </ul>
              </div>
            )}
            {result.opportunities > 0 && (
              <p className="text-xs text-gray-500 mt-2">
                View your <a href="/opportunities" className="text-brand-600 hover:underline">Pipeline</a> or{" "}
                <a href="/accounts" className="text-brand-600 hover:underline">Accounts</a>.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Standard importer ────────────────────────────────────────────────────────

function StandardImporter({ tab }: { tab: keyof typeof TEMPLATES }) {
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [fileName, setFileName] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ created: number; skipped: number; errors: string[] } | null>(null);
  const [parseError, setParseError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const template = TEMPLATES[tab];

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
          setParseError("Could not parse CSV.");
          return;
        }
        setRows(res.data);
      },
      error() { setParseError("Failed to read the file."); },
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
      setResult(await res.json());
      setRows([]);
      setFileName("");
      if (fileRef.current) fileRef.current.value = "";
    } catch {
      setResult({ created: 0, skipped: rows.length, errors: ["Network error."] });
    }
    setImporting(false);
  }

  const previewRows = rows.slice(0, 5);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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
        <button onClick={() => downloadTemplate(tab)} className="btn-secondary w-full justify-center">
          Download Template CSV
        </button>
      </div>

      <div className="lg:col-span-2 space-y-4">
        <div className="card p-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Upload CSV</h2>
          <label className="block border-2 border-dashed border-gray-200 rounded-xl p-8 text-center cursor-pointer hover:border-brand-400 transition-colors">
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
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
          {parseError && <p className="text-sm text-red-600 mt-2">{parseError}</p>}
        </div>

        {rows.length > 0 && (
          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-700">
                Preview{rows.length > 5 ? ` (first 5 of ${rows.length})` : ` (${rows.length} rows)`}
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    {Object.keys(previewRows[0]).map((col) => (
                      <th key={col} className="px-3 py-2 text-left font-semibold text-gray-500 whitespace-nowrap">{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {previewRows.map((row, i) => (
                    <tr key={i}>
                      {Object.values(row).map((val, j) => (
                        <td key={j} className="px-3 py-2 text-gray-600 max-w-[160px] truncate">{val}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {rows.length > 0 && (
          <button onClick={handleImport} disabled={importing} className="btn-primary w-full justify-center py-3">
            {importing ? "Importing..." : `Import ${rows.length} ${template.label}`}
          </button>
        )}

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
              <ul className="space-y-0.5">
                {result.errors.map((e, i) => <li key={i} className="text-xs text-red-600">· {e}</li>)}
              </ul>
            )}
            {result.created > 0 && (
              <p className="text-xs text-gray-500 mt-2">
                <a href={`/${tab}`} className="text-brand-600 hover:underline">View {template.label}</a>
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const TABS: { key: TabKey; label: string; badge?: string }[] = [
  { key: "pipeline", label: "Pipeline Sheet", badge: "IRL format" },
  { key: "accounts", label: "Accounts" },
  { key: "contacts", label: "Contacts" },
  { key: "opportunities", label: "Opportunities" },
];

export default function ImportPage() {
  const [tab, setTab] = useState<TabKey>("pipeline");

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Import from CSV</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Use <strong>Pipeline Sheet</strong> to import your existing Excel pipeline directly. Use the other tabs for clean structured imports.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-xl w-fit flex-wrap">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
              tab === t.key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
            {t.badge && (
              <span className="text-xs bg-brand-100 text-brand-700 px-1.5 py-0.5 rounded-full font-normal">
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === "pipeline" && <PipelineImporter />}
      {tab !== "pipeline" && <StandardImporter tab={tab as keyof typeof TEMPLATES} />}
    </div>
  );
}

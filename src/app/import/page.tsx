"use client";

import { useRef, useState } from "react";
import Papa from "papaparse";
import { AlertTriangle, Download, UploadCloud } from "lucide-react";
import { PRODUCT_KEYS } from "@/lib/products";

// ─── Template definitions ────────────────────────────────────────────────────

const PRODUCT_NOTE = "product — PLACEPULSE | PLYMIO | AI_NAVIGATOR | ADVISORY | UNASSIGNED";
const MARKET_NOTE = "markets — comma-separated codes: AE | SA | QA | KW | BH | OM | EG | JO";

const TEMPLATES = {
  accounts: {
    label: "Accounts",
    endpoint: "/api/import/accounts",
    productColumns: [] as string[],
    columns: ["name", "country", "sector", "industry", "size", "tier", "ownerEmail", "website", "description"],
    notes: [
      "name — required, must be unique (existing accounts are matched by name, never duplicated)",
      "country — AE | SA | QA | KW | BH | OM | EG | JO | OTHER  (default: AE)",
      "sector — GOVERNMENT | SEMI_GOVERNMENT | PRIVATE  (default: PRIVATE)",
      "size — SMALL | MEDIUM | LARGE | ENTERPRISE",
      "tier — STRATEGIC | KEY | STANDARD",
      "ownerEmail — must match a team member email",
    ],
    sample: [
      {
        name: "Emaar Malls",
        country: "AE",
        sector: "PRIVATE",
        industry: "Retail Real Estate",
        size: "ENTERPRISE",
        tier: "STRATEGIC",
        ownerEmail: "sara@arqonelabs.com",
        website: "https://emaarmalls.com",
        description: "Mall operator across Dubai",
      },
    ],
  },
  contacts: {
    label: "Contacts",
    endpoint: "/api/import/contacts",
    productColumns: [] as string[],
    columns: ["firstName", "lastName", "accountName", "email", "phone", "title", "role"],
    notes: [
      "firstName, lastName — required",
      "accountName — must exactly match an account already in the CRM",
      "email — used for duplicate protection",
      "role — DECISION_MAKER | INFLUENCER | CHAMPION | BLOCKER | OTHER",
    ],
    sample: [
      {
        firstName: "Layla",
        lastName: "Haddad",
        accountName: "Emaar Malls",
        email: "layla@emaarmalls.com",
        phone: "+971-50-000-0000",
        title: "Head of Insights",
        role: "CHAMPION",
      },
    ],
  },
  leads: {
    label: "Leads",
    endpoint: "/api/import/leads",
    productColumns: ["primaryProduct", "secondaryProducts"],
    columns: [
      "name", "company", "title", "email", "phone", "primaryProduct", "secondaryProducts",
      "markets", "source", "salesMotion", "status", "score", "estimatedValue", "ownerEmail", "notes",
    ],
    notes: [
      "name — required",
      "primaryProduct — " + PRODUCT_NOTE.split("— ")[1],
      "secondaryProducts — comma-separated product keys (cross-sell interest)",
      MARKET_NOTE,
      "salesMotion — DIRECT | PARTNER | REFERRAL | INVESTOR | INBOUND | OUTBOUND | EVENT | EXISTING_RELATIONSHIP | OTHER",
      "status — NEW | CONTACTED | QUALIFIED | DISQUALIFIED  (default: NEW)",
      "ownerEmail — must match a team member email",
      "Unknown product values are imported as UNASSIGNED with a warning — nothing is dropped silently.",
    ],
    sample: [
      {
        name: "Rania Majid",
        company: "Majid Al Futtaim",
        title: "Director of Analytics",
        email: "rania.majid@maf.ae",
        primaryProduct: "PLACEPULSE",
        secondaryProducts: "ADVISORY",
        markets: "AE,SA",
        source: "EVENT",
        salesMotion: "EVENT",
        status: "CONTACTED",
        score: "82",
        estimatedValue: "160000",
        ownerEmail: "sara@arqonelabs.com",
        notes: "Met at retail analytics summit",
      },
    ],
  },
  opportunities: {
    label: "Opportunities",
    endpoint: "/api/import/opportunities",
    productColumns: ["product"],
    columns: [
      "name", "accountName", "product", "stage", "value", "probability",
      "markets", "ownerEmail", "expectedCloseDate", "nextAction", "nextActionDate", "notes",
    ],
    notes: [
      "name — required",
      "accountName — must exactly match an account already in the CRM",
      "product — " + PRODUCT_NOTE.split("— ")[1] + " (exactly one per opportunity)",
      "stage — a stage key of that product's pipeline (e.g. IDENTIFIED, QUALIFIED, PROPOSAL). Unknown stages fall back to the first open stage.",
      MARKET_NOTE,
      "ownerEmail — must match a team member email",
      "expectedCloseDate / nextActionDate — YYYY-MM-DD",
      "Unknown product values are imported as UNASSIGNED with a warning — nothing is dropped silently.",
    ],
    sample: [
      {
        name: "Dubai Mall Location Intelligence Pilot",
        accountName: "Emaar Malls",
        product: "PLACEPULSE",
        stage: "PILOT",
        value: "180000",
        probability: "50",
        markets: "AE",
        ownerEmail: "sara@arqonelabs.com",
        expectedCloseDate: "2026-09-30",
        nextAction: "Review pilot KPIs",
        nextActionDate: "2026-07-20",
        notes: "Pilot live across 3 flagship malls",
      },
    ],
  },
} as const;

type TabKey = keyof typeof TEMPLATES;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function downloadTemplate(tab: TabKey) {
  const t = TEMPLATES[tab];
  const csv = Papa.unparse([
    t.columns as unknown as string[],
    ...t.sample.map((r) => t.columns.map((c) => (r as Record<string, string>)[c] ?? "")),
  ]);
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `arqone_template_${tab}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Pre-import validation: rows with unknown product values (mapped to UNASSIGNED). */
function validateProducts(rows: Record<string, string>[], productColumns: readonly string[]) {
  const warnings: string[] = [];
  rows.forEach((row, i) => {
    for (const col of productColumns) {
      const raw = row[col]?.trim();
      if (!raw) continue;
      const values = col === "secondaryProducts" ? raw.split(",").map((s) => s.trim()) : [raw];
      for (const v of values) {
        if (v && !(PRODUCT_KEYS as readonly string[]).includes(v.toUpperCase())) {
          warnings.push(
            `Row ${i + 2}: unknown ${col} value "${v}" — will be imported as UNASSIGNED. Valid keys: ${PRODUCT_KEYS.join(", ")}`
          );
        }
      }
    }
  });
  return warnings;
}

// ─── Importer ─────────────────────────────────────────────────────────────────

function Importer({ tab }: { tab: TabKey }) {
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [fileName, setFileName] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ created: number; skipped: number; errors: string[]; warnings?: string[] } | null>(null);
  const [parseError, setParseError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const template = TEMPLATES[tab];

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    setParseError("");
    setWarnings([]);
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
        setWarnings(validateProducts(res.data, template.productColumns));
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
      setResult(await res.json());
      setRows([]);
      setFileName("");
      setWarnings([]);
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
          <Download size={15} aria-hidden /> Download Template CSV
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
              <div className="flex flex-col items-center gap-2">
                <UploadCloud size={22} className="text-gray-300" aria-hidden />
                <p className="text-sm text-gray-500">Click to choose a CSV file</p>
              </div>
            )}
          </label>
          {parseError && <p role="alert" className="text-sm text-red-600 mt-2">{parseError}</p>}
        </div>

        {/* Validation step */}
        {warnings.length > 0 && (
          <div role="alert" className="card p-5 border-l-4 border-amber-500">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle size={15} className="text-amber-500" aria-hidden />
              <h2 className="text-sm font-semibold text-gray-800">
                {warnings.length} mapping warning{warnings.length !== 1 ? "s" : ""} — review before importing
              </h2>
            </div>
            <ul className="space-y-0.5 max-h-40 overflow-y-auto">
              {warnings.map((w, i) => (
                <li key={i} className="text-xs text-amber-700">· {w}</li>
              ))}
            </ul>
            <p className="text-xs text-gray-500 mt-2">
              Fix the values in your CSV and re-upload, or import anyway — flagged records land in the
              Unassigned queue for manual classification.
            </p>
          </div>
        )}

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
            {importing ? "Importing…" : `Import ${rows.length} ${template.label}`}
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
            {(result.warnings ?? []).length > 0 && (
              <ul className="space-y-0.5 mb-2">
                {result.warnings!.map((w, i) => (
                  <li key={i} className="text-xs text-amber-700">· {w}</li>
                ))}
              </ul>
            )}
            {result.errors.length > 0 && (
              <ul className="space-y-0.5">
                {result.errors.map((e, i) => <li key={i} className="text-xs text-red-600">· {e}</li>)}
              </ul>
            )}
            {result.created > 0 && (
              <p className="text-xs text-gray-500 mt-2">
                <a href={`/${tab === "opportunities" ? "opportunities" : tab}`} className="text-brand-600 hover:underline">
                  View {template.label}
                </a>
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const TABS: { key: TabKey; label: string }[] = [
  { key: "accounts", label: "Accounts" },
  { key: "contacts", label: "Contacts" },
  { key: "leads", label: "Leads" },
  { key: "opportunities", label: "Opportunities" },
];

export default function ImportPage() {
  const [tab, setTab] = useState<TabKey>("accounts");

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Import from CSV</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Import accounts first, then contacts, leads and opportunities. Product values are validated before
          import — unknown values are flagged and land in the Unassigned queue.
        </p>
      </div>

      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-xl w-fit flex-wrap" role="tablist" aria-label="Import type">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t.key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <Importer tab={tab} />
    </div>
  );
}

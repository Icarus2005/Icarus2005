"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import type { DataAudit } from "@/lib/dataAudit";

// Client-side only: formats and copies the audit payload already rendered on
// this page. Never fetches anything itself — no network call, no risk of
// pulling in anything beyond what the server already sent to the browser.
export default function CopyAuditButton({ audit }: { audit: DataAudit }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(JSON.stringify(audit, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-md border border-gray-200 bg-white hover:bg-gray-50 text-gray-700"
    >
      {copied ? <Check size={13} className="text-green-600" /> : <Copy size={13} />}
      {copied ? "Copied" : "Copy audit JSON"}
    </button>
  );
}

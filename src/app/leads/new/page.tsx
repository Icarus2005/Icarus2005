"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  COUNTRIES, PRODUCTS, DIGITAL_MATURITY, LEAD_SOURCES, LEAD_STATUSES,
} from "@/lib/constants";

export default function NewLeadPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const data = Object.fromEntries(new FormData(e.currentTarget));
    const body = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== ""));
    const res = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const lead = await res.json();
      router.push(`/leads/${lead.id}`);
    } else {
      setError("Failed to create lead.");
      setSaving(false);
    }
  }

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-6">
        <Link href="/leads" className="text-sm text-gray-500 hover:text-gray-700">← Leads</Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">New Lead</h1>
      </div>

      <form onSubmit={handleSubmit} className="card p-6 space-y-5">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Name *</label>
            <input name="name" required className="input" placeholder="Omar Nasser" />
          </div>
          <div>
            <label className="label">Company</label>
            <input name="company" className="input" placeholder="Alshaya Group" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Job Title</label>
            <input name="title" className="input" placeholder="VP Retail Tech" />
          </div>
          <div>
            <label className="label">Region</label>
            <select name="region" defaultValue="UAE" className="input">
              {Object.entries(COUNTRIES).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Email</label>
            <input name="email" type="email" className="input" />
          </div>
          <div>
            <label className="label">Phone</label>
            <input name="phone" className="input" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Sector</label>
            <input name="sector" className="input" placeholder="Retail, F&B, Gov..." />
          </div>
          <div>
            <label className="label">Product Interest</label>
            <select name="productInterest" defaultValue="" className="input">
              <option value="">Select product</option>
              {Object.entries(PRODUCTS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="label">Digital Maturity</label>
            <select name="digitalMaturity" defaultValue="" className="input">
              <option value="">Unknown</option>
              {Object.entries(DIGITAL_MATURITY).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Source</label>
            <select name="source" defaultValue="" className="input">
              <option value="">Select source</option>
              {Object.entries(LEAD_SOURCES).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Score (0–100)</label>
            <input name="score" type="number" min="0" max="100" className="input" placeholder="—" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Status</label>
            <select name="status" defaultValue="NEW" className="input">
              {Object.entries(LEAD_STATUSES).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Tags</label>
            <input name="tags" className="input" placeholder="GITEX, priority" />
          </div>
        </div>

        <div>
          <label className="label">Notes</label>
          <textarea name="notes" rows={3} className="input resize-none" placeholder="Context, requirements..." />
        </div>

        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? "Saving..." : "Create Lead"}
          </button>
          <Link href="/leads" className="btn-secondary">Cancel</Link>
        </div>
      </form>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  COUNTRIES, PRODUCTS, DIGITAL_MATURITY, LEAD_SOURCES, LEAD_STATUSES,
} from "@/lib/constants";
import OwnerSelect from "@/components/OwnerSelect";

export default function EditLeadPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [lead, setLead] = useState<Record<string, string> | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/leads/${params.id}`).then((r) => r.json()).then(setLead);
  }, [params.id]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const data = Object.fromEntries(new FormData(e.currentTarget));
    const body: Record<string, unknown> = Object.fromEntries(
      Object.entries(data).filter(([, v]) => v !== "")
    );
    // Allow clearing the owner back to Unassigned
    body.ownerId = data.ownerId || null;
    const res = await fetch(`/api/leads/${params.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      router.push(`/leads/${params.id}`);
    } else {
      setError("Failed to save.");
      setSaving(false);
    }
  }

  if (!lead) return <div className="p-8 text-gray-400">Loading...</div>;

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-6">
        <Link href={`/leads/${params.id}`} className="text-sm text-gray-500 hover:text-gray-700">← {lead.name}</Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">Edit Lead</h1>
      </div>

      <form onSubmit={handleSubmit} className="card p-6 space-y-5">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Name *</label>
            <input name="name" required defaultValue={lead.name} className="input" />
          </div>
          <div>
            <label className="label">Company</label>
            <input name="company" defaultValue={lead.company ?? ""} className="input" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Job Title</label>
            <input name="title" defaultValue={lead.title ?? ""} className="input" />
          </div>
          <div>
            <label className="label">Market</label>
            <select name="markets" defaultValue={lead.markets} className="input">
              {Object.entries(COUNTRIES).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Email</label>
            <input name="email" type="email" defaultValue={lead.email ?? ""} className="input" />
          </div>
          <div>
            <label className="label">Phone</label>
            <input name="phone" defaultValue={lead.phone ?? ""} className="input" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Sector</label>
            <input name="sector" defaultValue={lead.sector ?? ""} className="input" />
          </div>
          <div>
            <label className="label">Product Interest</label>
            <select name="productInterest" defaultValue={lead.productInterest ?? ""} className="input">
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
            <select name="digitalMaturity" defaultValue={lead.digitalMaturity ?? ""} className="input">
              <option value="">Unknown</option>
              {Object.entries(DIGITAL_MATURITY).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Source</label>
            <select name="source" defaultValue={lead.source ?? ""} className="input">
              <option value="">Select source</option>
              {Object.entries(LEAD_SOURCES).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Score (0–100)</label>
            <input name="score" type="number" min="0" max="100" defaultValue={lead.score ?? ""} className="input" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Status</label>
            <select name="status" defaultValue={lead.status} className="input">
              {Object.entries(LEAD_STATUSES).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Tags</label>
            <input name="tags" defaultValue={lead.tags ?? ""} className="input" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Owner</label>
            <OwnerSelect defaultValue={lead.ownerId} />
          </div>
        </div>

        <div>
          <label className="label">Notes</label>
          <textarea name="notes" rows={3} defaultValue={lead.notes ?? ""} className="input resize-none" />
        </div>

        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? "Saving..." : "Save Changes"}
          </button>
          <Link href={`/leads/${params.id}`} className="btn-secondary">Cancel</Link>
        </div>
      </form>
    </div>
  );
}

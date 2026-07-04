"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { GCC_COUNTRIES, SECTORS, COMPANY_SIZES } from "@/lib/constants";

export default function EditAccountPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [account, setAccount] = useState<Record<string, string> | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/accounts/${params.id}`)
      .then((r) => r.json())
      .then(setAccount);
  }, [params.id]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const data = Object.fromEntries(new FormData(e.currentTarget));
    const body = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== ""));
    const res = await fetch(`/api/accounts/${params.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      router.push(`/accounts/${params.id}`);
    } else {
      setError("Failed to save. Please try again.");
      setSaving(false);
    }
  }

  if (!account) return <div className="p-8 text-gray-400">Loading...</div>;

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-6">
        <Link href={`/accounts/${params.id}`} className="text-sm text-gray-500 hover:text-gray-700">
          ← {account.name}
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">Edit Account</h1>
      </div>

      <form onSubmit={handleSubmit} className="card p-6 space-y-5">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>
        )}
        <div>
          <label className="label">Company Name *</label>
          <input name="name" required defaultValue={account.name} className="input" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Country</label>
            <select name="country" defaultValue={account.country} className="input">
              {Object.entries(GCC_COUNTRIES).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Sector</label>
            <select name="sector" defaultValue={account.sector} className="input">
              {Object.entries(SECTORS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Industry</label>
            <input name="industry" defaultValue={account.industry ?? ""} className="input" />
          </div>
          <div>
            <label className="label">Company Size</label>
            <select name="size" defaultValue={account.size ?? ""} className="input">
              <option value="">Select size</option>
              {Object.entries(COMPANY_SIZES).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Website</label>
            <input name="website" type="url" defaultValue={account.website ?? ""} className="input" />
          </div>
          <div>
            <label className="label"># Locations</label>
            <input name="locationsCount" type="number" min="0" defaultValue={account.locationsCount ?? ""} className="input" />
          </div>
        </div>

        <div>
          <label className="label">Past ArqOne Engagements</label>
          <input name="pastEngagements" defaultValue={account.pastEngagements ?? ""} className="input" />
        </div>
        <div>
          <label className="label">Description</label>
          <textarea name="description" rows={3} defaultValue={account.description ?? ""} className="input resize-none" />
        </div>
        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? "Saving..." : "Save Changes"}
          </button>
          <Link href={`/accounts/${params.id}`} className="btn-secondary">Cancel</Link>
        </div>
      </form>
    </div>
  );
}

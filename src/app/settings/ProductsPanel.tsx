"use client";

import { useCallback, useEffect, useState } from "react";
import ProductBadge from "@/components/ProductBadge";

type Product = {
  key: string;
  name: string;
  description: string | null;
  active: boolean;
  displayOrder: number;
  _counts?: { leads: number; opportunities: number };
};

export default function ProductsPanel() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Product | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/products");
      if (!res.ok) throw new Error();
      setProducts(await res.json());
    } catch {
      setError("Could not load products.");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);
    setError("");
    const data = Object.fromEntries(new FormData(e.currentTarget));
    const res = await fetch(`/api/products/${editing.key}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: data.name,
        description: data.description,
        displayOrder: Number(data.displayOrder),
      }),
    });
    if (res.ok) {
      setEditing(null);
      await load();
    } else {
      const err = await res.json().catch(() => null);
      setError(err?.error ?? "Save failed.");
    }
    setSaving(false);
  }

  async function toggleActive(p: Product) {
    setError("");
    const res = await fetch(`/api/products/${p.key}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !p.active }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      setError(err?.error ?? "Could not change product state.");
    }
    await load();
  }

  if (loading) return <div className="card p-8 text-center text-gray-400">Loading products…</div>;

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Products</h2>
        <p className="text-sm text-gray-500">
          Canonical business lines. Keys are stable identifiers stored on every record; names are display labels.
          A product owning records cannot be deactivated until they are reassigned.
        </p>
      </div>

      {error && (
        <div role="alert" className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg mb-4">
          {error}
        </div>
      )}

      <div className="card divide-y divide-gray-100">
        {products.map((p) => (
          <div key={p.key} className={`p-5 ${!p.active ? "opacity-50" : ""}`}>
            {editing?.key === p.key ? (
              <form onSubmit={save} className="space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="label" htmlFor={`pn-${p.key}`}>Name</label>
                    <input id={`pn-${p.key}`} name="name" defaultValue={p.name} className="input" required />
                  </div>
                  <div>
                    <label className="label">Key</label>
                    <input value={p.key} disabled className="input bg-gray-50 text-gray-400" />
                  </div>
                  <div>
                    <label className="label" htmlFor={`po-${p.key}`}>Display Order</label>
                    <input id={`po-${p.key}`} name="displayOrder" type="number" defaultValue={p.displayOrder} className="input" />
                  </div>
                </div>
                <div>
                  <label className="label" htmlFor={`pd-${p.key}`}>Description</label>
                  <input id={`pd-${p.key}`} name="description" defaultValue={p.description ?? ""} className="input" />
                </div>
                <div className="flex gap-2">
                  <button type="submit" disabled={saving} className="btn-primary disabled:opacity-60">
                    {saving ? "Saving…" : "Save"}
                  </button>
                  <button type="button" onClick={() => setEditing(null)} className="btn-secondary">Cancel</button>
                </div>
              </form>
            ) : (
              <div className="flex items-center gap-4">
                <ProductBadge product={p.key} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-gray-900">
                    {p.name} <span className="text-xs text-gray-400 font-normal">({p.key})</span>
                  </p>
                  <p className="text-sm text-gray-500 truncate">{p.description ?? "—"}</p>
                </div>
                <div className="text-xs text-gray-400 shrink-0 hidden sm:block">
                  {p._counts?.leads ?? 0} leads · {p._counts?.opportunities ?? 0} deals
                </div>
                {!p.active && <span className="badge bg-gray-100 text-gray-500">Inactive</span>}
                <button onClick={() => setEditing(p)} className="btn-secondary text-xs px-3 py-1.5">Edit</button>
                {p.key !== "UNASSIGNED" && (
                  <button onClick={() => toggleActive(p)} className="btn-secondary text-xs px-3 py-1.5">
                    {p.active ? "Deactivate" : "Activate"}
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

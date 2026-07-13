"use client";

import { useCallback, useEffect, useState } from "react";
import ProductBadge from "@/components/ProductBadge";

type Stage = {
  id: string;
  key: string;
  name: string;
  order: number;
  defaultProbability: number;
  isWon: boolean;
  isLost: boolean;
  active: boolean;
};

type Pipeline = {
  id: string;
  name: string;
  productKey: string;
  active: boolean;
  stages: Stage[];
};

export default function PipelinesPanel() {
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // staged edits for the pipeline currently being edited
  const [draft, setDraft] = useState<Pipeline | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/pipelines");
      if (!res.ok) throw new Error();
      setPipelines(await res.json());
    } catch {
      setError("Could not load pipelines.");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function startEdit(p: Pipeline) {
    setEditingId(p.id);
    setDraft(JSON.parse(JSON.stringify(p)));
    setError("");
  }

  function updateStage(stageId: string, patch: Partial<Stage>) {
    if (!draft) return;
    setDraft({
      ...draft,
      stages: draft.stages.map((s) => (s.id === stageId ? { ...s, ...patch } : s)),
    });
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    setError("");
    const res = await fetch(`/api/pipelines/${draft.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: draft.name,
        stages: draft.stages.map((s) => ({
          id: s.id,
          name: s.name,
          defaultProbability: s.defaultProbability,
          active: s.active,
        })),
      }),
    });
    if (res.ok) {
      setEditingId(null);
      setDraft(null);
      await load();
    } else {
      const err = await res.json().catch(() => null);
      setError(err?.error ?? "Save failed.");
    }
    setSaving(false);
  }

  if (loading) return <div className="card p-8 text-center text-gray-400">Loading pipelines…</div>;

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Pipelines</h2>
        <p className="text-sm text-gray-500">
          Each product owns its own ordered sales stages with default probabilities.
          Stages holding open deals cannot be deactivated.
        </p>
      </div>

      {error && (
        <div role="alert" className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg mb-4">
          {error}
        </div>
      )}

      <div className="space-y-4">
        {pipelines.map((p) => {
          const isEditing = editingId === p.id;
          const view = isEditing && draft ? draft : p;
          return (
            <div key={p.id} className="card p-5">
              <div className="flex items-center gap-3 mb-3 flex-wrap">
                <ProductBadge product={p.productKey} />
                {isEditing ? (
                  <input
                    aria-label="Pipeline name"
                    value={view.name}
                    onChange={(e) => setDraft({ ...draft!, name: e.target.value })}
                    className="input w-64"
                  />
                ) : (
                  <p className="font-semibold text-gray-900">{p.name}</p>
                )}
                {!p.active && <span className="badge bg-gray-100 text-gray-500">Inactive</span>}
                <div className="ml-auto flex gap-2">
                  {isEditing ? (
                    <>
                      <button onClick={save} disabled={saving} className="btn-primary text-xs px-3 py-1.5 disabled:opacity-60">
                        {saving ? "Saving…" : "Save"}
                      </button>
                      <button onClick={() => { setEditingId(null); setDraft(null); }} className="btn-secondary text-xs px-3 py-1.5">
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button onClick={() => startEdit(p)} className="btn-secondary text-xs px-3 py-1.5">Edit stages</button>
                  )}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wider text-gray-400">
                      <th className="py-1.5 pr-3 font-semibold">#</th>
                      <th className="py-1.5 pr-3 font-semibold">Stage</th>
                      <th className="py-1.5 pr-3 font-semibold">Key</th>
                      <th className="py-1.5 pr-3 font-semibold">Default %</th>
                      <th className="py-1.5 pr-3 font-semibold">Type</th>
                      <th className="py-1.5 font-semibold">Active</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {view.stages.map((s, i) => (
                      <tr key={s.id} className={!s.active ? "opacity-50" : ""}>
                        <td className="py-1.5 pr-3 text-gray-400">{i + 1}</td>
                        <td className="py-1.5 pr-3">
                          {isEditing ? (
                            <input
                              aria-label={`Stage ${s.key} name`}
                              value={s.name}
                              onChange={(e) => updateStage(s.id, { name: e.target.value })}
                              className="input py-1 w-56"
                            />
                          ) : (
                            <span className="text-gray-800">{s.name}</span>
                          )}
                        </td>
                        <td className="py-1.5 pr-3 text-xs text-gray-400">{s.key}</td>
                        <td className="py-1.5 pr-3">
                          {isEditing && !s.isWon && !s.isLost ? (
                            <input
                              aria-label={`Stage ${s.key} probability`}
                              type="number"
                              min={0}
                              max={100}
                              value={s.defaultProbability}
                              onChange={(e) => updateStage(s.id, { defaultProbability: Number(e.target.value) })}
                              className="input py-1 w-20"
                            />
                          ) : (
                            <span className="text-gray-600">{s.defaultProbability}%</span>
                          )}
                        </td>
                        <td className="py-1.5 pr-3">
                          {s.isWon ? (
                            <span className="badge bg-green-100 text-green-700">Won</span>
                          ) : s.isLost ? (
                            <span className="badge bg-red-100 text-red-700">Lost</span>
                          ) : (
                            <span className="text-xs text-gray-400">Open</span>
                          )}
                        </td>
                        <td className="py-1.5">
                          {isEditing && !s.isWon && !s.isLost ? (
                            <input
                              aria-label={`Stage ${s.key} active`}
                              type="checkbox"
                              checked={s.active}
                              onChange={(e) => updateStage(s.id, { active: e.target.checked })}
                              className="accent-brand-600"
                            />
                          ) : (
                            <span className="text-xs text-gray-400">{s.active ? "Yes" : "No"}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

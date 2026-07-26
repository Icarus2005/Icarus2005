"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle, BookOpen, Check, ChevronDown, ChevronRight, Pencil, Plus, Trash2, X,
} from "lucide-react";
import ProductBadge from "@/components/ProductBadge";
import { BUSINESS_LINES, PRODUCTS_META } from "@/lib/products";

type Entry = {
  id: string;
  kind: string;
  title: string;
  content: string;
  product: string | null;
  active: boolean;
};

const KINDS: { key: string; label: string; blurb: string }[] = [
  {
    key: "SERVICE_CATALOG",
    label: "Service Catalogue",
    blurb:
      "Everything you can deliver, per business line: what's included, what's explicitly excluded, duration, price band. The writer picks only the items discussed on the call.",
  },
  {
    key: "WINNING_EXAMPLE",
    label: "Winning Proposals",
    blurb:
      "Proposals that actually closed. This is the highest-leverage entry — it teaches what good looks like far better than any instruction.",
  },
  {
    key: "TEMPLATE",
    label: "Document Template",
    blurb: "Your section order and house structure for the finished document.",
  },
  {
    key: "BRAND",
    label: "Brand & Tone",
    blurb: "Voice, spelling, currency conventions, and anything that must never be claimed.",
  },
];

const STARTERS: Record<string, string> = {
  SERVICE_CATALOG: `- **<SKU name>** — <what it is>, <duration>. Rate: <amount>.
  - Includes: <deliverables>
  - Excludes: <what is explicitly out of scope>`,
  WINNING_EXAMPLE: `Paste the full text of a proposal that closed. Include the pricing that was
accepted. Client names can be redacted if you prefer — the structure and language
are what matter.`,
  TEMPLATE: `1. Introduction
2. Objectives
3. Why this is urgent (tailored to the client)
4. Why ArqOne
5. Recommended Engagement
6. Suggested Rollout
7. Pricing
8. Benefits & ROI
9. Next Steps
10. Acceptance (signature block)`,
  BRAND: `- Tone: <how you sound>
- Spelling: British / American
- Currency: <default>
- Never claim: <e.g. named clients without permission, unverified metrics>`,
};

export default function KnowledgePanel() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Entry | null>(null);
  const [addingKind, setAddingKind] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({ SERVICE_CATALOG: true });

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await fetch("/api/knowledge");
      if (!res.ok) throw new Error();
      setEntries(await res.json());
    } catch {
      setError("Could not load the knowledge base.");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function save(e: React.FormEvent<HTMLFormElement>, kind: string, id?: string) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const form = new FormData(e.currentTarget);
    const payload = {
      kind,
      title: form.get("title"),
      content: form.get("content"),
      product: form.get("product") || null,
    };
    const res = await fetch(id ? `/api/knowledge/${id}` : "/api/knowledge", {
      method: id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      setEditing(null);
      setAddingKind(null);
      await load();
    } else {
      const err = await res.json().catch(() => null);
      setError(err?.error ?? "Could not save.");
    }
    setSaving(false);
  }

  async function toggleActive(entry: Entry) {
    await fetch(`/api/knowledge/${entry.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !entry.active }),
    });
    await load();
  }

  async function remove(entry: Entry) {
    if (!confirm(`Delete “${entry.title}”? The proposal writer will stop using it.`)) return;
    await fetch(`/api/knowledge/${entry.id}`, { method: "DELETE" });
    await load();
  }

  // Coverage: which business lines have an active catalogue the writer can use.
  const catalogued = new Set(
    entries
      .filter((e) => e.kind === "SERVICE_CATALOG" && e.active && e.product)
      .map((e) => e.product as string)
  );
  const hasWinningExample = entries.some((e) => e.kind === "WINNING_EXAMPLE" && e.active);
  const placeholderCount = entries.filter(
    (e) => e.active && /\[SET RATE\]|\[SET MONTHLY RATE\]|<SKU name>/i.test(e.content)
  ).length;

  function EntryForm({ kind, entry }: { kind: string; entry?: Entry }) {
    return (
      <form
        onSubmit={(e) => save(e, kind, entry?.id)}
        className="card p-5 space-y-4 border-brand-200 ring-1 ring-brand-100"
      >
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2">
            <label className="label" htmlFor={`kb-title-${entry?.id ?? "new"}`}>Title *</label>
            <input
              id={`kb-title-${entry?.id ?? "new"}`}
              name="title"
              required
              defaultValue={entry?.title ?? ""}
              className="input"
              placeholder="AI Navigator service catalogue"
            />
          </div>
          <div>
            <label className="label" htmlFor={`kb-product-${entry?.id ?? "new"}`}>Business line</label>
            <select
              id={`kb-product-${entry?.id ?? "new"}`}
              name="product"
              defaultValue={entry?.product ?? ""}
              className="input"
            >
              <option value="">All business lines</option>
              {BUSINESS_LINES.map((k) => (
                <option key={k} value={k}>{PRODUCTS_META[k].label}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="label" htmlFor={`kb-content-${entry?.id ?? "new"}`}>
            Content * <span className="font-normal text-gray-400">— markdown supported</span>
          </label>
          <textarea
            id={`kb-content-${entry?.id ?? "new"}`}
            name="content"
            required
            rows={entry ? 14 : 10}
            defaultValue={entry?.content ?? STARTERS[kind] ?? ""}
            className="input resize-y font-mono text-xs leading-relaxed"
          />
        </div>
        <div className="flex gap-3">
          <button type="submit" disabled={saving} className="btn-primary disabled:opacity-60">
            {saving ? "Saving…" : entry ? "Save changes" : "Add entry"}
          </button>
          <button
            type="button"
            onClick={() => { setEditing(null); setAddingKind(null); }}
            className="btn-secondary"
          >
            Cancel
          </button>
        </div>
      </form>
    );
  }

  if (loading) return <div className="card p-8 text-center text-gray-400">Loading knowledge base…</div>;

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Proposal Knowledge Base</h2>
        <p className="text-sm text-gray-500">
          Instructions tell the pipeline <em>how</em> to write; this is <em>what</em> it writes from.
          Generic input here produces generic proposals — this content is the difference.
        </p>
      </div>

      {error && (
        <div role="alert" className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg mb-4">
          {error}
        </div>
      )}

      {/* Readiness */}
      <div className="card p-5 mb-6">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Pipeline readiness
        </p>
        <div className="flex flex-wrap gap-2 mb-3">
          {BUSINESS_LINES.map((k) => {
            const ready = catalogued.has(k);
            return (
              <span
                key={k}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
                  ready
                    ? "border-green-200 bg-green-50 text-green-700"
                    : "border-gray-200 bg-gray-50 text-gray-400"
                }`}
              >
                {ready ? <Check size={12} aria-hidden /> : <X size={12} aria-hidden />}
                {PRODUCTS_META[k].label}
              </span>
            );
          })}
        </div>
        <ul className="text-sm text-gray-600 space-y-1">
          <li>
            {catalogued.size === 0
              ? "No business line has a catalogue yet — proposals will be near-empty."
              : `${catalogued.size} of ${BUSINESS_LINES.length} business lines have a catalogue. Lines without one will produce weak drafts — that is the intended pilot gate.`}
          </li>
          {!hasWinningExample && (
            <li className="flex items-start gap-1.5 text-amber-700">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />
              No winning proposal added yet — this is the single highest-leverage entry.
            </li>
          )}
          {placeholderCount > 0 && (
            <li className="flex items-start gap-1.5 text-amber-700">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />
              {placeholderCount} {placeholderCount === 1 ? "entry still contains" : "entries still contain"}{" "}
              placeholder rates. Replace them before issuing any proposal.
            </li>
          )}
        </ul>
      </div>

      {/* Sections */}
      <div className="space-y-4">
        {KINDS.map((kind) => {
          const list = entries.filter((e) => e.kind === kind.key);
          const isOpen = open[kind.key] ?? false;
          return (
            <div key={kind.key} className="card overflow-hidden">
              <button
                onClick={() => setOpen((o) => ({ ...o, [kind.key]: !isOpen }))}
                aria-expanded={isOpen}
                className="w-full flex items-start gap-3 p-5 text-left hover:bg-gray-50 transition-colors"
              >
                {isOpen ? (
                  <ChevronDown size={16} className="text-gray-400 mt-0.5 shrink-0" aria-hidden />
                ) : (
                  <ChevronRight size={16} className="text-gray-400 mt-0.5 shrink-0" aria-hidden />
                )}
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <BookOpen size={15} className="text-brand-500" aria-hidden />
                    <span className="font-semibold text-gray-900">{kind.label}</span>
                    <span className="text-xs text-gray-400">
                      {list.length} {list.length === 1 ? "entry" : "entries"}
                    </span>
                  </span>
                  <span className="block text-sm text-gray-500 mt-1">{kind.blurb}</span>
                </span>
              </button>

              {isOpen && (
                <div className="px-5 pb-5 space-y-3 border-t border-gray-100 pt-4">
                  {list.length === 0 && (
                    <p className="text-sm text-gray-400">Nothing here yet.</p>
                  )}
                  {list.map((entry) =>
                    editing?.id === entry.id ? (
                      <EntryForm key={entry.id} kind={kind.key} entry={entry} />
                    ) : (
                      <div
                        key={entry.id}
                        className={`border border-gray-200 rounded-xl p-4 ${!entry.active ? "opacity-50" : ""}`}
                      >
                        <div className="flex items-start gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-medium text-gray-900">{entry.title}</p>
                              {entry.product ? (
                                <ProductBadge product={entry.product} />
                              ) : (
                                <span className="badge bg-gray-100 text-gray-600">All lines</span>
                              )}
                              {!entry.active && (
                                <span className="badge bg-gray-100 text-gray-500">Inactive</span>
                              )}
                            </div>
                            <pre className="mt-2 text-xs text-gray-500 whitespace-pre-wrap font-mono line-clamp-4 leading-relaxed">
                              {entry.content}
                            </pre>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => setEditing(entry)}
                              title="Edit"
                              aria-label={`Edit ${entry.title}`}
                              className="p-2 text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors"
                            >
                              <Pencil size={14} aria-hidden />
                            </button>
                            <button
                              onClick={() => toggleActive(entry)}
                              title={entry.active ? "Deactivate" : "Activate"}
                              aria-label={`${entry.active ? "Deactivate" : "Activate"} ${entry.title}`}
                              className="p-2 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                            >
                              {entry.active ? <X size={14} aria-hidden /> : <Check size={14} aria-hidden />}
                            </button>
                            <button
                              onClick={() => remove(entry)}
                              title="Delete"
                              aria-label={`Delete ${entry.title}`}
                              className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            >
                              <Trash2 size={14} aria-hidden />
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  )}

                  {addingKind === kind.key ? (
                    <EntryForm kind={kind.key} />
                  ) : (
                    <button
                      onClick={() => { setAddingKind(kind.key); setEditing(null); }}
                      className="btn-secondary text-xs px-3 py-1.5"
                    >
                      <Plus size={14} aria-hidden /> Add {kind.label.toLowerCase()} entry
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

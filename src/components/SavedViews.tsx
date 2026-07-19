"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Bookmark, BookmarkPlus, X } from "lucide-react";

type SavedView = { id: string; name: string; page: string; query: string };

/**
 * Persisted saved views for a list page. Saving captures the current URL query
 * string; opening a view reproduces the exact filtered state.
 */
function SavedViewsInner({ page }: { page: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [views, setViews] = useState<SavedView[]>([]);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/views?page=${page}`);
      if (res.ok) setViews(await res.json());
    } catch {
      /* saved views are non-critical — fail quietly */
    }
  }, [page]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (adding) inputRef.current?.focus();
  }, [adding]);

  const currentQuery = searchParams.toString();

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setError("");
    const res = await fetch("/api/views", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), page, query: currentQuery }),
    });
    if (res.ok) {
      setName("");
      setAdding(false);
      await load();
    } else {
      const err = await res.json().catch(() => null);
      setError(err?.error ?? "Could not save view.");
    }
  }

  async function remove(id: string) {
    await fetch(`/api/views/${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Bookmark size={14} className="text-gray-300 shrink-0" aria-hidden />
      {views.length === 0 && !adding && (
        <span className="text-xs text-gray-400">No saved views</span>
      )}
      {views.map((v) => {
        const active = currentQuery === v.query;
        return (
          <span
            key={v.id}
            className={`inline-flex items-center gap-1 rounded-full border text-xs transition-colors ${
              active
                ? "border-brand-400 bg-brand-50 text-brand-700"
                : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
            }`}
          >
            <Link
              href={v.query ? `${pathname}?${v.query}` : pathname}
              className="pl-2.5 py-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500 rounded-l-full"
            >
              {v.name}
            </Link>
            <button
              onClick={() => remove(v.id)}
              title={`Delete view ${v.name}`}
              aria-label={`Delete view ${v.name}`}
              className="pr-1.5 pl-0.5 py-1 text-gray-300 hover:text-red-500"
            >
              <X size={12} aria-hidden />
            </button>
          </span>
        );
      })}
      {adding ? (
        <form onSubmit={save} className="inline-flex items-center gap-1.5">
          <input
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setAdding(false)}
            placeholder="View name…"
            aria-label="Saved view name"
            maxLength={40}
            className="input py-1 px-2.5 text-xs w-36 rounded-full"
          />
          <button type="submit" className="text-xs font-medium text-brand-600 hover:underline">Save</button>
          <button type="button" onClick={() => setAdding(false)} className="text-xs text-gray-400 hover:text-gray-600">
            Cancel
          </button>
        </form>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"
          title="Save the current filters as a view"
        >
          <BookmarkPlus size={13} aria-hidden /> Save current view
        </button>
      )}
      {error && <span role="alert" className="text-xs text-red-600">{error}</span>}
    </div>
  );
}

export default function SavedViews({ page }: { page: string }) {
  return (
    <Suspense fallback={<div className="h-6" />}>
      <SavedViewsInner page={page} />
    </Suspense>
  );
}

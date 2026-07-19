"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Crosshair, Loader2, Search, TrendingUp, User } from "lucide-react";
import ProductBadge from "@/components/ProductBadge";

type Result = {
  type: "lead" | "opportunity" | "account" | "contact";
  id: string;
  title: string;
  subtitle: string;
  product: string | null;
  href: string;
};

const TYPE_META: Record<Result["type"], { label: string; icon: typeof Search }> = {
  lead: { label: "Lead", icon: Crosshair },
  opportunity: { label: "Deal", icon: TrendingUp },
  account: { label: "Account", icon: Building2 },
  contact: { label: "Contact", icon: User },
};

/**
 * Global command-palette search (Ctrl/Cmd+K) across leads, deals, accounts
 * and contacts. Also opens via the custom "arqone:open-search" window event.
 */
export default function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setResults([]);
    setActive(0);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") close();
    }
    function onOpenEvent() {
      setOpen(true);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("arqone:open-search", onOpenEvent);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("arqone:open-search", onOpenEvent);
    };
  }, [close]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 20);
  }, [open]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`);
        const data = await res.json();
        setResults(data.results ?? []);
        setActive(0);
      } catch {
        setResults([]);
      }
      setLoading(false);
    }, 200);
  }, [query]);

  function onInputKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && results[active]) {
      e.preventDefault();
      router.push(results[active].href);
      close();
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-brand-950/40 backdrop-blur-[2px] flex items-start justify-center pt-[12vh] px-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Global search"
    >
      <div className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
        <div className="flex items-center gap-3 px-4 border-b border-gray-100">
          {loading ? (
            <Loader2 size={17} className="text-gray-400 animate-spin shrink-0" aria-hidden />
          ) : (
            <Search size={17} className="text-gray-400 shrink-0" aria-hidden />
          )}
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKey}
            placeholder="Search leads, deals, accounts, contacts…"
            aria-label="Search the CRM"
            className="flex-1 py-3.5 text-sm outline-none placeholder:text-gray-400"
          />
          <kbd className="text-[10px] text-gray-400 border border-gray-200 rounded px-1.5 py-0.5">ESC</kbd>
        </div>

        <div className="max-h-[50vh] overflow-y-auto">
          {query.trim().length >= 2 && !loading && results.length === 0 && (
            <p className="p-6 text-center text-sm text-gray-400">No results for “{query.trim()}”.</p>
          )}
          {query.trim().length < 2 && (
            <p className="p-6 text-center text-sm text-gray-400">
              Type at least two characters to search the whole CRM.
            </p>
          )}
          {results.map((r, i) => {
            const meta = TYPE_META[r.type];
            const Icon = meta.icon;
            return (
              <button
                key={`${r.type}-${r.id}`}
                onClick={() => {
                  router.push(r.href);
                  close();
                }}
                onMouseEnter={() => setActive(i)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                  i === active ? "bg-brand-50" : "hover:bg-gray-50"
                }`}
              >
                <span className="w-7 h-7 rounded-lg bg-gray-100 text-gray-500 flex items-center justify-center shrink-0">
                  <Icon size={14} aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-gray-800 truncate">{r.title}</span>
                  {r.subtitle && <span className="block text-xs text-gray-400 truncate">{r.subtitle}</span>}
                </span>
                {r.product && <ProductBadge product={r.product} />}
                <span className="text-[10px] uppercase tracking-wide text-gray-300 shrink-0">{meta.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

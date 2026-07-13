"use client";

import { Suspense, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ALL_PRODUCT_KEYS, PRODUCTS_META, isProductKey } from "@/lib/products";

export const PRODUCT_STORAGE_KEY = "arqone-crm.product";

/**
 * Persistent product selector. The URL query (?product=KEY) is the source of
 * truth so copied links reopen the same filtered view; localStorage remembers
 * the last selection as a convenience default.
 */
function ProductSelectorInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const raw = searchParams.get("product");
  const current = raw && isProductKey(raw) ? raw : null;

  useEffect(() => {
    if (current) localStorage.setItem(PRODUCT_STORAGE_KEY, current);
    else localStorage.removeItem(PRODUCT_STORAGE_KEY);
  }, [current]);

  function select(key: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (key) params.set("product", key);
    else params.delete("product");
    router.push(params.size ? `${pathname}?${params.toString()}` : pathname);
  }

  return (
    <div
      role="group"
      aria-label="Filter by product"
      className="inline-flex items-center gap-1 bg-white border border-gray-200 rounded-xl p-1 flex-wrap"
    >
      <button
        onClick={() => select(null)}
        aria-pressed={current === null}
        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500 ${
          current === null
            ? "bg-brand-600 text-white shadow-sm"
            : "text-gray-600 hover:bg-gray-50"
        }`}
      >
        All Products
      </button>
      {ALL_PRODUCT_KEYS.map((key) => {
        const meta = PRODUCTS_META[key];
        const active = current === key;
        return (
          <button
            key={key}
            onClick={() => select(key)}
            aria-pressed={active}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500 ${
              active ? "bg-brand-600 text-white shadow-sm" : "text-gray-600 hover:bg-gray-50"
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${active ? "bg-white" : meta.dot}`} aria-hidden />
            {meta.label}
          </button>
        );
      })}
    </div>
  );
}

export default function ProductSelector() {
  return (
    <Suspense fallback={<div className="h-10" />}>
      <ProductSelectorInner />
    </Suspense>
  );
}

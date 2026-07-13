"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import LeadForm from "../LeadForm";

function NewLeadInner() {
  const searchParams = useSearchParams();
  const defaultProduct = searchParams.get("product") ?? undefined;

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-6">
        <Link href="/leads" className="text-sm text-gray-500 hover:text-gray-700">← Leads</Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">New Lead</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Every lead belongs to one primary business line; secondary interests track cross-sell potential.
        </p>
      </div>
      <LeadForm defaultProduct={defaultProduct} />
    </div>
  );
}

export default function NewLeadPage() {
  return (
    <Suspense fallback={<div className="p-8 text-gray-400">Loading…</div>}>
      <NewLeadInner />
    </Suspense>
  );
}

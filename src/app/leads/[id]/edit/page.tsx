"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import LeadForm, { type LeadFormValues } from "../../LeadForm";

export default function EditLeadPage({ params }: { params: { id: string } }) {
  const [lead, setLead] = useState<LeadFormValues | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/leads/${params.id}`)
      .then((r) => {
        if (!r.ok) throw new Error("not found");
        return r.json();
      })
      .then(setLead)
      .catch(() => setError("Could not load this lead."));
  }, [params.id]);

  if (error) {
    return (
      <div className="p-8">
        <div role="alert" className="card p-6 text-red-600">{error}</div>
      </div>
    );
  }
  if (!lead) return <div className="p-8 text-gray-400">Loading…</div>;

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-6">
        <Link href={`/leads/${params.id}`} className="text-sm text-gray-500 hover:text-gray-700">
          ← {lead.name}
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">Edit Lead</h1>
      </div>
      <LeadForm lead={lead} />
    </div>
  );
}

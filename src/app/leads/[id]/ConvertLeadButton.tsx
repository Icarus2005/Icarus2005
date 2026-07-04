"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function ConvertLeadButton({
  leadId,
  convertedOpportunityId,
  disqualified,
}: {
  leadId: string;
  convertedOpportunityId: string | null;
  disqualified: boolean;
}) {
  const router = useRouter();
  const [converting, setConverting] = useState(false);
  const [error, setError] = useState("");

  if (convertedOpportunityId) {
    return (
      <Link href={`/opportunities/${convertedOpportunityId}`} className="btn-secondary">
        View Deal →
      </Link>
    );
  }

  if (disqualified) return null;

  async function handleConvert() {
    setConverting(true);
    setError("");
    const res = await fetch(`/api/leads/${leadId}/convert`, { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      router.push(`/opportunities/${data.opportunityId}`);
    } else {
      setError("Conversion failed");
      setConverting(false);
    }
  }

  return (
    <div>
      <button onClick={handleConvert} disabled={converting} className="btn-primary">
        {converting ? "Converting..." : "Convert to Deal"}
      </button>
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}

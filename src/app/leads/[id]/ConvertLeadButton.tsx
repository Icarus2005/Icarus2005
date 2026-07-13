"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

/**
 * Entry point to the conversion review screen. Conversion is never a blind
 * one-click action — the review page states exactly what will be created.
 */
export default function ConvertLeadButton({
  leadId,
  convertedOpportunityId,
  disqualified,
}: {
  leadId: string;
  convertedOpportunityId: string | null;
  disqualified: boolean;
}) {
  if (convertedOpportunityId) {
    return (
      <Link href={`/opportunities/${convertedOpportunityId}`} className="btn-secondary">
        View Deal <ArrowRight size={14} aria-hidden />
      </Link>
    );
  }
  if (disqualified) return null;
  return (
    <Link href={`/leads/${leadId}/convert`} className="btn-primary">
      Convert to Deal <ArrowRight size={14} aria-hidden />
    </Link>
  );
}

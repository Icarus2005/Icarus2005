"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Download } from "lucide-react";

/** Downloads the current filtered list as CSV via the matching export API. */
function ExportButtonInner({ entity }: { entity: "leads" | "opportunities" }) {
  const searchParams = useSearchParams();
  const qs = searchParams.toString();
  return (
    <a
      href={`/api/export/${entity}${qs ? `?${qs}` : ""}`}
      className="btn-secondary"
      title="Export the current filtered list as CSV"
    >
      <Download size={15} aria-hidden /> Export CSV
    </a>
  );
}

export default function ExportButton({ entity }: { entity: "leads" | "opportunities" }) {
  return (
    <Suspense fallback={null}>
      <ExportButtonInner entity={entity} />
    </Suspense>
  );
}

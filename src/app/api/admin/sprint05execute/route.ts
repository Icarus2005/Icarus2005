import { NextRequest, NextResponse } from "next/server";
import { previewSprint05Execution, executeSprint05 } from "@/lib/sprint05Execute";

// Gated by the same CRM_ACCESS_PASSWORD middleware as every other route
// (src/middleware.ts). This is the NARROWLY SCOPED execution surface for
// the categories the CRM owner explicitly approved (Lead->primary-contact
// backfill minus Adrian Roodt/John Bevan, AccountProduct backfill minus
// Travelport/dnata Travel, Contact provenance minus Adrian/John, and three
// named Opportunity primary-contact assignments). Task due dates and every
// other Sprint 05 preview category remain untouched — see
// /api/admin/sprint05 for the full read-only preview.

export async function GET() {
  const preview = await previewSprint05Execution();
  return NextResponse.json(preview);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  if (body?.confirm !== "EXECUTE_SPRINT_05_APPROVED_SCOPE") {
    return NextResponse.json(
      { error: "Missing confirmation. POST { \"confirm\": \"EXECUTE_SPRINT_05_APPROVED_SCOPE\" } to run." },
      { status: 400 }
    );
  }
  const report = await executeSprint05();
  return NextResponse.json({ report });
}

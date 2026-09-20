import { NextResponse } from "next/server";
import { previewSprint06aDueDates } from "@/lib/sprint06aPreview";

// Gated by the same CRM_ACCESS_PASSWORD middleware as every other route
// (src/middleware.ts). GET only — deliberately no POST/execute handler this
// sprint. Sprint 06A stops after the preview until the CRM owner approves it.

export async function GET() {
  const preview = await previewSprint06aDueDates();
  return NextResponse.json(preview);
}

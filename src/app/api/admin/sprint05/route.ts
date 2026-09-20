import { NextResponse } from "next/server";
import { generateSprint05Preview } from "@/lib/sprint05Preview";

// Gated by the same CRM_ACCESS_PASSWORD middleware as every other route
// (src/middleware.ts). GET only — deliberately no POST/execute handler this
// sprint. Sprint 05 is preview/read-only until the CRM owner approves
// individual categories in a later sprint.

export async function GET() {
  const preview = await generateSprint05Preview();
  return NextResponse.json(preview);
}

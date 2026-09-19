import { NextRequest, NextResponse } from "next/server";
import { previewSprint03, executeSprint03 } from "@/lib/sprint03Reconcile";

// Gated by the same CRM_ACCESS_PASSWORD middleware as every other route
// (src/middleware.ts) — no separate secret here. GET is read-only. POST
// requires an explicit body confirmation token so it can never fire from a
// stray request; it still only ever writes the specific, ID-anchored Sprint
// 03 changes reviewed with the user, wrapped in one transaction.

export async function GET() {
  const preview = await previewSprint03();
  return NextResponse.json(preview);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  if (body?.confirm !== "EXECUTE_SPRINT_03") {
    return NextResponse.json(
      { error: "Missing confirmation. POST { \"confirm\": \"EXECUTE_SPRINT_03\" } to run." },
      { status: 400 }
    );
  }
  const report = await executeSprint03();
  return NextResponse.json({ report });
}

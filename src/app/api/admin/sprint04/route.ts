import { NextRequest, NextResponse } from "next/server";
import { previewImport, executeImport } from "@/lib/sprint04Import";

// Gated by the same CRM_ACCESS_PASSWORD middleware as every other route
// (src/middleware.ts). GET is read-only. POST requires an explicit body
// confirmation token.

export async function GET() {
  const preview = await previewImport();
  return NextResponse.json(preview);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  if (body?.confirm !== "EXECUTE_SPRINT_04") {
    return NextResponse.json(
      { error: "Missing confirmation. POST { \"confirm\": \"EXECUTE_SPRINT_04\" } to run." },
      { status: 400 }
    );
  }
  const report = await executeImport();
  return NextResponse.json({ report });
}

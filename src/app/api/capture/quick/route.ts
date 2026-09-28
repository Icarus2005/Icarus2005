import { NextRequest, NextResponse } from "next/server";
import { saveQuickCapture, QuickCaptureError, type QuickSaveInput } from "@/lib/capture/saveQuick";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid capture." }, { status: 400 });
  const fields = ["idempotencyKey", "ownerId", "transcript", "eventName", "eventDate", "location", "personName", "companyName", "statedRole", "productKey", "conversationSummary", "relationshipContext", "theirCommitment", "myCommitment", "nextAction", "dueDate", "notes", "email", "phone", "contactId", "accountId"] as const;
  const input = Object.fromEntries(fields.map((key) => [key, typeof body[key] === "string" ? body[key] : ""])) as QuickSaveInput;
  try {
    return NextResponse.json(await saveQuickCapture(input), { status: 201 });
  } catch (error) {
    if (error instanceof QuickCaptureError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Quick Capture save failed:", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "CRM save failed. Your reviewed capture is still on this screen; retry safely." }, { status: 500 });
  }
}

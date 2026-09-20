import { NextRequest, NextResponse } from "next/server";
import { captureEvent, CaptureEventInput } from "@/lib/capture/eventCapture";

/**
 * Quick Capture — Sprint 06E, Phase 15.
 *
 * All matching/validation logic lives in src/lib/capture/eventCapture.ts so
 * it's exercised the same way whether the request comes from the browser
 * or a test. Auth is the same shared-password gate as every other route
 * (src/middleware.ts).
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Request body must be a JSON object." }, { status: 400 });
  }
  const b = body as Record<string, unknown>;

  const input: CaptureEventInput = {
    eventName: typeof b.eventName === "string" ? b.eventName : "",
    fullName: typeof b.fullName === "string" ? b.fullName : "",
    company: typeof b.company === "string" ? b.company : "",
    jobTitle: typeof b.jobTitle === "string" ? b.jobTitle : null,
    email: typeof b.email === "string" ? b.email : null,
    phone: typeof b.phone === "string" ? b.phone : null,
    linkedin: typeof b.linkedin === "string" ? b.linkedin : null,
    product: typeof b.product === "string" ? b.product : "",
    acquisitionKey: typeof b.acquisitionKey === "string" ? (b.acquisitionKey as CaptureEventInput["acquisitionKey"]) : null,
    note: typeof b.note === "string" ? b.note : null,
    nextAction: typeof b.nextAction === "string" ? b.nextAction : null,
    dueDate: typeof b.dueDate === "string" ? b.dueDate : null,
    idempotencyKey: typeof b.idempotencyKey === "string" ? b.idempotencyKey : "",
    confirmReviewRequired: b.confirmReviewRequired === true,
  };

  const result = await captureEvent(input);
  if (!result.ok) {
    if (result.status === 409) {
      return NextResponse.json({ classification: result.classification, conflict: result.conflict }, { status: 409 });
    }
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result, { status: 201 });
}

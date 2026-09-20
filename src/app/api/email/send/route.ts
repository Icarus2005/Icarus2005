import { NextRequest, NextResponse } from "next/server";
import { getEmailProvider } from "@/lib/email/zoho";
import { isSalesCopilotEntityType } from "@/lib/salesCopilot/context";
import { sendApprovedEmail, SendApprovedEmailInput } from "@/lib/email/sendApprovedEmail";

/**
 * Approved-send route (Sprint 06D, Phase 5).
 *
 * DRAFT → HUMAN REVIEW → APPROVE → SEND VIA ZOHO → RECORD ACTIVITY. This is
 * the only route in the app that calls an email provider. Authorization is
 * the same shared-password gate that protects every other route
 * (src/middleware.ts) — there is no per-user auth model yet to check
 * against, consistent with every other API route in this app.
 *
 * All validation and the actual send/record logic live in
 * src/lib/email/sendApprovedEmail.ts so it can be exercised in tests with a
 * fake EmailProvider — this route only parses the request and maps the
 * result to an HTTP response.
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

  const { entityType, entityId, contactId, to, cc, subject, plaintextBody, idempotencyKey, taskId } = body as Record<string, unknown>;

  if (entityType !== undefined && entityType !== null && !isSalesCopilotEntityType(entityType)) {
    return NextResponse.json({ error: "Unsupported entityType." }, { status: 400 });
  }
  if (taskId !== undefined && taskId !== null && typeof taskId !== "string") {
    return NextResponse.json({ error: "taskId must be a string when provided." }, { status: 400 });
  }

  const input: SendApprovedEmailInput = {
    entityType: (entityType as SendApprovedEmailInput["entityType"]) ?? null,
    entityId: typeof entityId === "string" ? entityId : null,
    contactId: typeof contactId === "string" ? contactId : "",
    to: typeof to === "string" ? to : "",
    cc: typeof cc === "string" ? cc : null,
    subject: typeof subject === "string" ? subject : "",
    plaintextBody: typeof plaintextBody === "string" ? plaintextBody : "",
    idempotencyKey: typeof idempotencyKey === "string" ? idempotencyKey : "",
    taskId: typeof taskId === "string" ? taskId : null,
  };

  const result = await sendApprovedEmail(input, getEmailProvider());
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(
    { activity: result.activity, providerMessageId: result.providerMessageId, relatedTaskId: result.relatedTaskId, replay: result.replay },
    { status: result.status }
  );
}

import { NextRequest, NextResponse } from "next/server";
import { buildSalesContext, isSalesCopilotEntityType } from "@/lib/salesCopilot/context";
import { isSalesCopilotAction, runNextAction, runDraftEmail, runMeetingObjective } from "@/lib/salesCopilot/prompt";
import { isZohoConfigured } from "@/lib/email/zoho";

/**
 * Sales Copilot — Sprint 06C, Phase 8.
 *
 * DRAFT + RECOMMEND only. This route never writes to the CRM, never sends
 * anything externally, and never accepts an arbitrary prompt from the
 * browser — the server always constructs the prompt from trusted CRM data
 * via buildSalesContext(). Authorization is the same shared-password gate
 * that protects every other route in this app (src/middleware.ts) — there
 * is no per-user auth model yet to check against.
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

  const { entityType, entityId, action } = body as Record<string, unknown>;

  if (!isSalesCopilotEntityType(entityType)) {
    return NextResponse.json({ error: "Unsupported entityType. Must be LEAD, CONTACT, or OPPORTUNITY." }, { status: 400 });
  }
  if (typeof entityId !== "string" || !entityId) {
    return NextResponse.json({ error: "entityId is required." }, { status: 400 });
  }
  if (!isSalesCopilotAction(action)) {
    return NextResponse.json({ error: "Unsupported action. Must be NEXT_ACTION, DRAFT_EMAIL, or MEETING_OBJECTIVE." }, { status: 400 });
  }

  const context = await buildSalesContext(entityType, entityId);
  if (!context) {
    return NextResponse.json({ error: `${entityType} ${entityId} not found.` }, { status: 404 });
  }

  let result;
  switch (action) {
    case "NEXT_ACTION":
      result = await runNextAction(context);
      break;
    case "DRAFT_EMAIL":
      result = await runDraftEmail(context);
      break;
    case "MEETING_OBJECTIVE":
      result = await runMeetingObjective(context);
      break;
  }

  // Sprint 06D: the approval/send flow (client-side) needs to know which
  // Contact a draft is about, its email on file, and a same-request open
  // task if exactly one exists — included here so the panel doesn't need a
  // second round trip, without changing the shape of `result` itself.
  const recipient = {
    contactId: context.contactId,
    contactEmail: context.contactEmail,
    contactName: context.contactName,
    candidateTaskId: context.openTasks.length === 1 ? context.openTasks[0].id : null,
    candidateTaskTitle: context.openTasks.length === 1 ? context.openTasks[0].title : null,
  };

  return NextResponse.json({ action, entityType, entityId, result, recipient, emailConfigured: isZohoConfigured() });
}

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runTriage } from "@/lib/proposals/triage";

/**
 * Phase 1/2 entry point — webhook for meeting recorders (Fathom, Fireflies, or
 * any system that can POST JSON). Accepts a few common payload shapes and
 * normalises them.
 *
 * Idempotent: re-delivery of the same externalId updates rather than
 * duplicates, so a recorder retrying never creates a second proposal.
 *
 * Secured with a shared secret when MEETING_WEBHOOK_SECRET is set, supplied as
 * `X-Webhook-Secret` or `?secret=`. Without the env var the endpoint is open —
 * acceptable locally, but set it in any deployed environment.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.MEETING_WEBHOOK_SECRET;
  if (secret) {
    const { searchParams } = new URL(req.url);
    const supplied = req.headers.get("x-webhook-secret") ?? searchParams.get("secret");
    if (supplied !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Normalise across recorder payload shapes.
  const meeting = (body.meeting ?? body.recording ?? body) as Record<string, unknown>;
  const title = String(meeting.title ?? meeting.name ?? body.title ?? "Untitled meeting").slice(0, 300);
  const rawTranscript = String(
    body.transcript ?? meeting.transcript ?? body.transcript_text ?? meeting.summary ?? ""
  ).trim();

  if (!rawTranscript) {
    return NextResponse.json(
      { error: "No transcript found in payload (expected `transcript`)" },
      { status: 400 }
    );
  }

  const externalId = body.id ?? meeting.id ?? body.recording_id ?? null;
  const rawDate = meeting.started_at ?? meeting.date ?? body.meetingDate ?? null;
  const parsedDate = rawDate ? new Date(String(rawDate)) : new Date();
  const meetingDate = isNaN(parsedDate.getTime()) ? new Date() : parsedDate;

  const attendeesValue = meeting.attendees ?? body.attendees;
  const attendees = Array.isArray(attendeesValue)
    ? attendeesValue
        .map((a) => (typeof a === "string" ? a : ((a as Record<string, unknown>)?.email ?? "")))
        .filter(Boolean)
        .join(",")
    : attendeesValue
      ? String(attendeesValue)
      : null;

  const data = {
    title,
    rawTranscript,
    source: String(body.source ?? "WEBHOOK").toUpperCase(),
    meetingDate,
    attendees,
    durationMins: meeting.duration_minutes ? Number(meeting.duration_minutes) : null,
  };

  const transcript = externalId
    ? await prisma.meetingTranscript.upsert({
        where: { externalId: String(externalId) },
        update: data,
        create: { ...data, externalId: String(externalId) },
      })
    : await prisma.meetingTranscript.create({ data });

  // Triage immediately so the inbox is decision-ready. A triage failure must
  // not lose the transcript, so it's reported but not fatal.
  let triageError: string | null = null;
  try {
    await runTriage(transcript.id);
  } catch (err) {
    triageError = err instanceof Error ? err.message : "Triage failed";
  }

  const result = await prisma.meetingTranscript.findUnique({ where: { id: transcript.id } });
  return NextResponse.json({ transcript: result, triageError }, { status: 201 });
}

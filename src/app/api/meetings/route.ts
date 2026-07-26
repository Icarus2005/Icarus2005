export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") ?? "";
  const search = searchParams.get("search") ?? "";

  const transcripts = await prisma.meetingTranscript.findMany({
    where: {
      AND: [
        status ? { triageStatus: status } : {},
        search ? { title: { contains: search, mode: "insensitive" } } : {},
      ],
    },
    include: {
      account: { select: { id: true, name: true } },
      proposals: { select: { id: true, stage: true } },
    },
    orderBy: { meetingDate: "desc" },
    take: 100,
  });
  return NextResponse.json(transcripts);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const title = String(body.title ?? "").trim();
  const rawTranscript = String(body.rawTranscript ?? "").trim();

  if (!title) return NextResponse.json({ error: "Title is required" }, { status: 400 });
  if (!rawTranscript) {
    return NextResponse.json({ error: "Transcript text is required" }, { status: 400 });
  }

  const transcript = await prisma.meetingTranscript.create({
    data: {
      title,
      rawTranscript,
      source: body.source ?? "MANUAL",
      meetingDate: body.meetingDate ? new Date(body.meetingDate) : new Date(),
      durationMins: body.durationMins ? Number(body.durationMins) : null,
      attendees: body.attendees ?? null,
      accountId: body.accountId || null,
    },
  });
  return NextResponse.json(transcript, { status: 201 });
}

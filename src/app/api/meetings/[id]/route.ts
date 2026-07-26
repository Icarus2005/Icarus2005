import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runTriage } from "@/lib/proposals/triage";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const transcript = await prisma.meetingTranscript.findUnique({
    where: { id: params.id },
    include: {
      account: { select: { id: true, name: true } },
      contact: { select: { id: true, firstName: true, lastName: true } },
      proposals: { select: { id: true, title: true, stage: true, product: true } },
    },
  });
  if (!transcript) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(transcript);
}

/** Re-runs triage on demand (e.g. after linking an account). */
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const updated = await runTriage(params.id);
    return NextResponse.json(updated);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Triage failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await prisma.meetingTranscript.delete({ where: { id: params.id } });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return new NextResponse(null, { status: 204 });
}

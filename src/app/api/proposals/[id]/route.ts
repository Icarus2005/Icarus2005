import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isProductKey } from "@/lib/products";
import { isProposalStage } from "@/lib/proposals/stages";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const proposal = await prisma.proposal.findUnique({
    where: { id: params.id },
    include: {
      account: { select: { id: true, name: true } },
      owner: { select: { id: true, name: true } },
      opportunity: { select: { id: true, name: true } },
      transcript: { select: { id: true, title: true, meetingDate: true, triageScore: true } },
      events: { orderBy: { createdAt: "desc" }, take: 50 },
    },
  });
  if (!proposal) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(proposal);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await req.json();
  const data: Record<string, unknown> = {};

  if (body.title !== undefined) data.title = String(body.title).trim();
  if (body.clientName !== undefined) data.clientName = body.clientName || null;
  if (body.notes !== undefined) data.notes = body.notes || null;
  if (body.ownerId !== undefined) data.ownerId = body.ownerId || null;
  if (body.estimatedValue !== undefined) {
    data.estimatedValue = Number(body.estimatedValue) || null;
  }
  if (body.product !== undefined) {
    if (!isProductKey(body.product)) {
      return NextResponse.json({ error: "Invalid product" }, { status: 400 });
    }
    data.product = body.product;
  }
  // Editing the generated document before approval is expected.
  if (body.formatted !== undefined) data.formatted = body.formatted;
  if (body.draftContent !== undefined) data.draftContent = body.draftContent;

  if (body.stage !== undefined) {
    if (!isProposalStage(body.stage)) {
      return NextResponse.json({ error: "Invalid stage" }, { status: 400 });
    }
    data.stage = body.stage;
    data.stageChangedAt = new Date();
  }

  try {
    const proposal = await prisma.proposal.update({ where: { id: params.id }, data });
    if (body.stage !== undefined) {
      await prisma.proposalEvent.create({
        data: {
          proposalId: params.id,
          stage: body.stage,
          status: "COMPLETED",
          detail: "Stage set manually",
        },
      });
    }
    return NextResponse.json(proposal);
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await prisma.proposal.delete({ where: { id: params.id } });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return new NextResponse(null, { status: 204 });
}

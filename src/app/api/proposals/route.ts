export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isProductKey, productLabel } from "@/lib/products";
import { cleanProduct } from "@/lib/filters";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const product = cleanProduct(searchParams.get("product"));
  const stage = searchParams.get("stage") ?? "";
  const ownerId = searchParams.get("ownerId") ?? "";

  const proposals = await prisma.proposal.findMany({
    where: {
      AND: [product ? { product } : {}, stage ? { stage } : {}, ownerId ? { ownerId } : {}],
    },
    include: {
      account: { select: { id: true, name: true } },
      owner: { select: { id: true, name: true } },
      opportunity: { select: { id: true, name: true } },
      transcript: { select: { id: true, title: true, meetingDate: true } },
    },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json(proposals);
}

/**
 * Creates a proposal, optionally promoting a triaged transcript into the
 * pipeline. Product falls back to the transcript's triage verdict.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();

  let transcript = null;
  if (body.transcriptId) {
    transcript = await prisma.meetingTranscript.findUnique({
      where: { id: String(body.transcriptId) },
    });
    if (!transcript) {
      return NextResponse.json({ error: "Transcript not found" }, { status: 404 });
    }
  }

  const product =
    body.product && isProductKey(body.product)
      ? body.product
      : (transcript?.detectedProduct ?? "UNASSIGNED");

  const clientName =
    body.clientName ?? (transcript ? transcript.title.replace(/\s*[-–—|].*$/, "").trim() : null);

  const title =
    String(body.title ?? "").trim() ||
    `${productLabel(product)} Proposal — ${clientName ?? "New Client"}`;

  const proposal = await prisma.proposal.create({
    data: {
      title,
      product,
      clientName,
      estimatedValue: body.estimatedValue != null ? Number(body.estimatedValue) || null : null,
      transcriptId: transcript?.id ?? null,
      accountId: body.accountId ?? transcript?.accountId ?? null,
      ownerId: body.ownerId || null,
      notes: body.notes ?? null,
    },
  });

  await prisma.proposalEvent.create({
    data: { proposalId: proposal.id, stage: "QUEUED", status: "COMPLETED", detail: "Proposal created" },
  });

  return NextResponse.json(proposal, { status: 201 });
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const stage = searchParams.get("stage") ?? "";
  const type = searchParams.get("type") ?? "";
  const accountId = searchParams.get("accountId") ?? "";

  const opportunities = await prisma.opportunity.findMany({
    where: {
      AND: [
        stage ? { stage } : {},
        type ? { type } : {},
        accountId ? { accountId } : {},
      ],
    },
    include: {
      account: { select: { id: true, name: true, country: true } },
      contacts: { include: { contact: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json(opportunities);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (body.value !== undefined) body.value = Number(body.value) || null;
  if (body.probability !== undefined) body.probability = Number(body.probability) || null;
  if (body.expectedCloseDate) body.expectedCloseDate = new Date(body.expectedCloseDate);
  body.decisionMakerEngaged = body.decisionMakerEngaged === true || body.decisionMakerEngaged === "on";
  if (["CLOSED_WON", "CLOSED_LOST"].includes(body.stage)) body.closedAt = new Date();

  const opportunity = await prisma.opportunity.create({
    data: body,
    include: {
      account: { select: { id: true, name: true } },
    },
  });
  return NextResponse.json(opportunity, { status: 201 });
}

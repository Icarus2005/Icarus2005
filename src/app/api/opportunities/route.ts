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
  const opportunity = await prisma.opportunity.create({
    data: body,
    include: {
      account: { select: { id: true, name: true } },
    },
  });
  return NextResponse.json(opportunity, { status: 201 });
}

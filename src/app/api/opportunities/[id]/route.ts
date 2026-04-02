import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const opp = await prisma.opportunity.findUnique({
    where: { id: params.id },
    include: {
      account: true,
      contacts: { include: { contact: true } },
      activities: {
        include: { contact: true },
        orderBy: { date: "desc" },
      },
    },
  });
  if (!opp) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(opp);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await req.json();
  const opp = await prisma.opportunity.update({
    where: { id: params.id },
    data: body,
  });
  return NextResponse.json(opp);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  await prisma.opportunity.delete({ where: { id: params.id } });
  return new NextResponse(null, { status: 204 });
}

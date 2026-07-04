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
      tasks: { orderBy: { dueDate: "asc" } },
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
  if (body.value !== undefined) body.value = Number(body.value) || null;
  if (body.probability !== undefined) body.probability = Number(body.probability) || null;
  if (body.expectedCloseDate) body.expectedCloseDate = new Date(body.expectedCloseDate);
  body.decisionMakerEngaged = body.decisionMakerEngaged === true || body.decisionMakerEngaged === "on";

  // Stamp closedAt on transition into a closed stage (drives time-to-close KPI)
  if (body.stage) {
    const existing = await prisma.opportunity.findUnique({
      where: { id: params.id },
      select: { closedAt: true },
    });
    const closing = ["CLOSED_WON", "CLOSED_LOST"].includes(body.stage);
    if (closing && !existing?.closedAt) body.closedAt = new Date();
    if (!closing) body.closedAt = null;
  }

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

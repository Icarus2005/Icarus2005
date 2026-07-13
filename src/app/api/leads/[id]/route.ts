import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const lead = await prisma.lead.findUnique({
    where: { id: params.id },
    include: {
      owner: { select: { id: true, name: true } },
      activities: { orderBy: { date: "desc" }, take: 20 },
      tasks: { orderBy: { dueDate: "asc" } },
    },
  });
  if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(lead);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await req.json();
  if (body.score !== undefined) body.score = Number(body.score) || null;
  const lead = await prisma.lead.update({
    where: { id: params.id },
    data: body,
  });
  return NextResponse.json(lead);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  await prisma.lead.delete({ where: { id: params.id } });
  return new NextResponse(null, { status: 204 });
}

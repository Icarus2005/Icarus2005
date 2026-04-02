import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const contact = await prisma.contact.findUnique({
    where: { id: params.id },
    include: {
      account: true,
      opportunities: { include: { opportunity: true } },
      activities: { orderBy: { date: "desc" }, take: 20 },
    },
  });
  if (!contact) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(contact);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await req.json();
  const contact = await prisma.contact.update({
    where: { id: params.id },
    data: body,
  });
  return NextResponse.json(contact);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  await prisma.contact.delete({ where: { id: params.id } });
  return new NextResponse(null, { status: 204 });
}

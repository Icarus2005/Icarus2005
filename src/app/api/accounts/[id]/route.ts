import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const account = await prisma.account.findUnique({
    where: { id: params.id },
    include: {
      contacts: true,
      opportunities: { orderBy: { createdAt: "desc" } },
      activities: {
        include: { contact: true },
        orderBy: { date: "desc" },
        take: 20,
      },
    },
  });

  if (!account) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(account);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await req.json();
  const account = await prisma.account.update({
    where: { id: params.id },
    data: body,
  });
  return NextResponse.json(account);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  await prisma.account.delete({ where: { id: params.id } });
  return new NextResponse(null, { status: 204 });
}

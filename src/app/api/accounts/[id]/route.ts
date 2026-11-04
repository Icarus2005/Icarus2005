import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const account = await prisma.account.findUnique({
    where: { id: id },
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
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  if (body.locationsCount !== undefined) body.locationsCount = Number(body.locationsCount) || null;
  const account = await prisma.account.update({
    where: { id: id },
    data: body,
  });
  return NextResponse.json(account);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.account.delete({ where: { id: id } });
  return new NextResponse(null, { status: 204 });
}

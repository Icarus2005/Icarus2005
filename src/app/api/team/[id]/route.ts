import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const VALID_ROLES = ["SALES_DIRECTOR", "SALES_EXECUTIVE", "VIEWER"];

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const member = await prisma.teamMember.findUnique({
    where: { id: params.id },
    include: {
      _count: { select: { leads: true, opportunities: true, tasks: true } },
    },
  });
  if (!member) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(member);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await req.json();
  const data: Record<string, unknown> = {};

  if (body.name !== undefined) data.name = String(body.name).trim();
  if (body.email !== undefined) data.email = String(body.email).trim().toLowerCase();
  if (body.role !== undefined && VALID_ROLES.includes(body.role)) data.role = body.role;
  if (body.active !== undefined) data.active = Boolean(body.active);

  try {
    const member = await prisma.teamMember.update({
      where: { id: params.id },
      data,
    });
    return NextResponse.json(member);
  } catch {
    return NextResponse.json({ error: "Update failed — email may already be in use" }, { status: 400 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  // Owned records keep existing (ownerId is set null via onDelete: SetNull)
  await prisma.teamMember.delete({ where: { id: params.id } });
  return new NextResponse(null, { status: 204 });
}

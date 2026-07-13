import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const VALID_ROLES = ["SALES_DIRECTOR", "SALES_EXECUTIVE", "VIEWER"];

export async function GET() {
  const members = await prisma.teamMember.findMany({
    orderBy: [{ active: "desc" }, { createdAt: "asc" }],
    include: {
      _count: { select: { leads: true, opportunities: true, tasks: true } },
    },
  });
  return NextResponse.json(members);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const name = body.name?.trim();
  const email = body.email?.trim().toLowerCase();
  const role = VALID_ROLES.includes(body.role) ? body.role : "SALES_EXECUTIVE";

  if (!name || !email) {
    return NextResponse.json({ error: "Name and email are required" }, { status: 400 });
  }

  const existing = await prisma.teamMember.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "A team member with this email already exists" }, { status: 409 });
  }

  const member = await prisma.teamMember.create({
    data: { name, email, role },
  });
  return NextResponse.json(member, { status: 201 });
}

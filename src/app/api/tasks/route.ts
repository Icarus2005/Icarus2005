import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") ?? "";

  const tasks = await prisma.task.findMany({
    where: status ? { status } : {},
    include: {
      lead: { select: { id: true, name: true, company: true } },
      account: { select: { id: true, name: true } },
      contact: { select: { id: true, firstName: true, lastName: true } },
      opportunity: { select: { id: true, name: true } },
    },
    orderBy: [{ status: "asc" }, { dueDate: "asc" }],
  });

  return NextResponse.json(tasks);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (body.dueDate) body.dueDate = new Date(body.dueDate);
  const task = await prisma.task.create({ data: body });
  return NextResponse.json(task, { status: 201 });
}

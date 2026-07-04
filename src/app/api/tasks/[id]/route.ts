import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await req.json();
  if (body.dueDate) body.dueDate = new Date(body.dueDate);
  const task = await prisma.task.update({
    where: { id: params.id },
    data: body,
  });
  return NextResponse.json(task);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  await prisma.task.delete({ where: { id: params.id } });
  return new NextResponse(null, { status: 204 });
}

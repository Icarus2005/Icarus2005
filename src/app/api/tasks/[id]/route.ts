import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await req.json();
  if ("dueDate" in body) body.dueDate = body.dueDate ? new Date(body.dueDate) : null;
  if ("clientCommitmentDate" in body) body.clientCommitmentDate = body.clientCommitmentDate ? new Date(body.clientCommitmentDate) : null;
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

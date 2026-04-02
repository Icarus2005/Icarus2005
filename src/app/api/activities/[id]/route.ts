import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await req.json();
  const activity = await prisma.activity.update({
    where: { id: params.id },
    data: body,
  });
  return NextResponse.json(activity);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  await prisma.activity.delete({ where: { id: params.id } });
  return new NextResponse(null, { status: 204 });
}

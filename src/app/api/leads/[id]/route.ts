import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isProductKey, parseProductList } from "@/lib/products";

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

  if (body.primaryProduct !== undefined && !isProductKey(body.primaryProduct)) {
    return NextResponse.json({ error: "Invalid primaryProduct" }, { status: 400 });
  }
  if (body.secondaryProducts !== undefined) {
    const list = Array.isArray(body.secondaryProducts)
      ? body.secondaryProducts
      : parseProductList(body.secondaryProducts);
    const cleaned = list.filter(
      (k: string) => isProductKey(k) && k !== body.primaryProduct && k !== "UNASSIGNED"
    );
    body.secondaryProducts = cleaned.length ? cleaned.join(",") : null;
  }
  if (body.score !== undefined) body.score = Number(body.score) || null;
  if (body.estimatedValue !== undefined) body.estimatedValue = Number(body.estimatedValue) || null;
  if (body.nextActionDate) body.nextActionDate = new Date(body.nextActionDate);
  if (Array.isArray(body.markets)) body.markets = body.markets.join(",");

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

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isProductKey } from "@/lib/products";
import { isKnowledgeKind } from "@/lib/proposals/knowledge";

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await req.json();
  const data: Record<string, unknown> = {};

  if (body.title !== undefined) {
    const title = String(body.title).trim();
    if (!title) return NextResponse.json({ error: "Title cannot be empty" }, { status: 400 });
    data.title = title;
  }
  if (body.content !== undefined) {
    const content = String(body.content).trim();
    if (!content) return NextResponse.json({ error: "Content cannot be empty" }, { status: 400 });
    data.content = content;
  }
  if (body.kind !== undefined) {
    if (!isKnowledgeKind(body.kind)) {
      return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
    }
    data.kind = body.kind;
  }
  if (body.product !== undefined) {
    const product = body.product ? String(body.product) : null;
    if (product && !isProductKey(product)) {
      return NextResponse.json({ error: "Invalid product" }, { status: 400 });
    }
    data.product = product;
  }
  if (body.active !== undefined) data.active = Boolean(body.active);

  try {
    const entry = await prisma.proposalKnowledge.update({ where: { id: params.id }, data });
    return NextResponse.json(entry);
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await prisma.proposalKnowledge.delete({ where: { id: params.id } });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return new NextResponse(null, { status: 204 });
}

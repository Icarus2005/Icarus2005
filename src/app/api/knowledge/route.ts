export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isProductKey } from "@/lib/products";
import { isKnowledgeKind } from "@/lib/proposals/knowledge";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const kind = searchParams.get("kind") ?? "";
  const product = searchParams.get("product") ?? "";

  const entries = await prisma.proposalKnowledge.findMany({
    where: {
      AND: [
        kind ? { kind } : {},
        product ? { OR: [{ product }, { product: null }] } : {},
      ],
    },
    orderBy: [{ kind: "asc" }, { createdAt: "asc" }],
  });
  return NextResponse.json(entries);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const title = String(body.title ?? "").trim();
  const content = String(body.content ?? "").trim();
  const kind = String(body.kind ?? "");

  if (!title) return NextResponse.json({ error: "Title is required" }, { status: 400 });
  if (!content) return NextResponse.json({ error: "Content is required" }, { status: 400 });
  if (!isKnowledgeKind(kind)) {
    return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
  }
  // null product = applies to every business line
  const product = body.product ? String(body.product) : null;
  if (product && !isProductKey(product)) {
    return NextResponse.json({ error: "Invalid product" }, { status: 400 });
  }

  const entry = await prisma.proposalKnowledge.create({
    data: { title, content, kind, product, active: body.active !== false },
  });
  return NextResponse.json(entry, { status: 201 });
}

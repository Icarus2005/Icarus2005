import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isProductKey } from "@/lib/products";

// Bulk assignment: { ids: string[], primaryProduct?: string, ownerId?: string | null }
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const ids: string[] = Array.isArray(body.ids) ? body.ids : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: "ids is required" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (body.primaryProduct !== undefined) {
    if (!isProductKey(body.primaryProduct)) {
      return NextResponse.json({ error: "Invalid primaryProduct" }, { status: 400 });
    }
    data.primaryProduct = body.primaryProduct;
  }
  if (body.ownerId !== undefined) data.ownerId = body.ownerId || null;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const result = await prisma.lead.updateMany({
    where: { id: { in: ids } },
    data,
  });
  return NextResponse.json({ updated: result.count });
}

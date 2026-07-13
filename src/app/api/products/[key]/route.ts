import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PUT(
  req: NextRequest,
  { params }: { params: { key: string } }
) {
  const body = await req.json();
  const data: Record<string, unknown> = {};
  if (body.name !== undefined) data.name = String(body.name).trim();
  if (body.description !== undefined) data.description = String(body.description).trim() || null;
  if (body.displayOrder !== undefined) data.displayOrder = Number(body.displayOrder) || 0;

  if (body.active !== undefined) {
    const active = Boolean(body.active);
    if (!active) {
      // Guard: a product that still owns records cannot be deactivated
      // without reassignment — surface the counts instead of silently hiding.
      const [leads, opps] = await Promise.all([
        prisma.lead.count({ where: { primaryProduct: params.key } }),
        prisma.opportunity.count({ where: { product: params.key, closedAt: null } }),
      ]);
      if (leads > 0 || opps > 0) {
        return NextResponse.json(
          {
            error: `Cannot deactivate: ${leads} lead(s) and ${opps} open opportunit(ies) still use this product. Reassign them first.`,
          },
          { status: 409 }
        );
      }
    }
    data.active = active;
  }

  try {
    const product = await prisma.product.update({ where: { key: params.key }, data });
    return NextResponse.json(product);
  } catch {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }
}

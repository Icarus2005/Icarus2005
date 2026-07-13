export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getProducts } from "@/lib/catalog";

export async function GET() {
  const products = await getProducts();
  const counts = await Promise.all(
    products.map(async (p) => ({
      key: p.key,
      leads: await prisma.lead.count({ where: { primaryProduct: p.key } }),
      opportunities: await prisma.opportunity.count({ where: { product: p.key } }),
    }))
  );
  const countMap = new Map(counts.map((c) => [c.key, c]));
  return NextResponse.json(
    products.map((p) => ({
      ...p,
      _counts: {
        leads: countMap.get(p.key)?.leads ?? 0,
        opportunities: countMap.get(p.key)?.opportunities ?? 0,
      },
    }))
  );
}

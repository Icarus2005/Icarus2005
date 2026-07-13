import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isProductKey, parseProductList } from "@/lib/products";
import { cleanProduct, leadProductWhere } from "@/lib/filters";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") ?? "";
  const status = searchParams.get("status") ?? "";
  const markets = searchParams.get("markets") ?? "";
  const product = cleanProduct(searchParams.get("product"));
  const ownerId = searchParams.get("ownerId") ?? "";
  const motion = searchParams.get("motion") ?? "";
  const source = searchParams.get("source") ?? "";

  const leads = await prisma.lead.findMany({
    where: {
      AND: [
        search
          ? {
              OR: [
                { name: { contains: search } },
                { company: { contains: search } },
                { email: { contains: search } },
              ],
            }
          : {},
        status ? { status } : {},
        markets ? { markets: { contains: markets } } : {},
        leadProductWhere(product),
        ownerId ? { ownerId } : {},
        motion ? { salesMotion: motion } : {},
        source ? { source } : {},
      ],
    },
    include: { owner: { select: { id: true, name: true } } },
    orderBy: [{ score: "desc" }, { createdAt: "desc" }],
  });

  return NextResponse.json(leads);
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  // Primary product is required and must be a canonical key.
  if (!body.primaryProduct || !isProductKey(body.primaryProduct)) {
    return NextResponse.json(
      { error: "primaryProduct is required and must be a valid product key" },
      { status: 400 }
    );
  }
  // Secondary interests: keep only valid keys, never the primary itself.
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

  // Duplicate protection: same email or same name+company
  if (body.email) {
    const dupe = await prisma.lead.findFirst({
      where: { email: body.email, status: { not: "DISQUALIFIED" } },
      select: { id: true, name: true },
    });
    if (dupe) {
      return NextResponse.json(
        { error: `A lead with this email already exists (${dupe.name})`, duplicateId: dupe.id },
        { status: 409 }
      );
    }
  }

  const lead = await prisma.lead.create({ data: body });
  return NextResponse.json(lead, { status: 201 });
}

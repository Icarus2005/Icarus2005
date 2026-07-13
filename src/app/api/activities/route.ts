import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isProductKey } from "@/lib/products";
import { cleanProduct, activityProductWhere } from "@/lib/filters";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const accountId = searchParams.get("accountId") ?? "";
  const opportunityId = searchParams.get("opportunityId") ?? "";
  const leadId = searchParams.get("leadId") ?? "";
  const type = searchParams.get("type") ?? "";
  const product = cleanProduct(searchParams.get("product"));
  const ownerId = searchParams.get("ownerId") ?? "";
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";
  const search = searchParams.get("search") ?? "";

  const activities = await prisma.activity.findMany({
    where: {
      AND: [
        accountId ? { accountId } : {},
        opportunityId ? { opportunityId } : {},
        leadId ? { leadId } : {},
        type ? { type } : {},
        activityProductWhere(product),
        ownerId ? { ownerId } : {},
        from ? { date: { gte: new Date(from) } } : {},
        to ? { date: { lte: new Date(to) } } : {},
        search
          ? { OR: [{ subject: { contains: search } }, { notes: { contains: search } }] }
          : {},
      ],
    },
    include: {
      lead: { select: { id: true, name: true, company: true, primaryProduct: true } },
      account: { select: { id: true, name: true } },
      contact: { select: { id: true, firstName: true, lastName: true } },
      opportunity: { select: { id: true, name: true, product: true } },
      owner: { select: { id: true, name: true } },
    },
    orderBy: { date: "desc" },
  });

  return NextResponse.json(activities);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (body.date) body.date = new Date(body.date);
  if (body.product !== undefined) {
    if (body.product && !isProductKey(body.product)) {
      return NextResponse.json({ error: "Invalid product" }, { status: 400 });
    }
    if (body.leadId || body.opportunityId) body.product = null;
    if (body.product === "") body.product = null;
  }
  const activity = await prisma.activity.create({
    data: body,
    include: {
      lead: { select: { id: true, name: true } },
      account: { select: { id: true, name: true } },
      contact: { select: { id: true, firstName: true, lastName: true } },
      opportunity: { select: { id: true, name: true } },
    },
  });

  // Stamp lastActivityAt on the related lead
  if (activity.leadId) {
    await prisma.lead.update({
      where: { id: activity.leadId },
      data: { lastActivityAt: activity.date },
    });
  }

  return NextResponse.json(activity, { status: 201 });
}

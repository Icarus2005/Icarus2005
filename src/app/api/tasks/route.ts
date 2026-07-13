import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isProductKey } from "@/lib/products";
import { cleanProduct, taskProductWhere } from "@/lib/filters";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") ?? "";
  const product = cleanProduct(searchParams.get("product"));
  const ownerId = searchParams.get("ownerId") ?? "";

  const tasks = await prisma.task.findMany({
    where: {
      AND: [
        status ? { status } : {},
        taskProductWhere(product),
        ownerId ? { ownerId } : {},
      ],
    },
    include: {
      lead: { select: { id: true, name: true, company: true, primaryProduct: true } },
      account: { select: { id: true, name: true } },
      contact: { select: { id: true, firstName: true, lastName: true } },
      opportunity: { select: { id: true, name: true, product: true } },
      owner: { select: { id: true, name: true } },
    },
    orderBy: [{ status: "asc" }, { dueDate: "asc" }],
  });

  return NextResponse.json(tasks);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (body.dueDate) body.dueDate = new Date(body.dueDate);
  // Explicit product only makes sense without lead/opportunity context —
  // linked records provide inherited product instead.
  if (body.product !== undefined) {
    if (body.product && !isProductKey(body.product)) {
      return NextResponse.json({ error: "Invalid product" }, { status: 400 });
    }
    if (body.leadId || body.opportunityId) body.product = null;
    if (body.product === "") body.product = null;
  }
  const task = await prisma.task.create({ data: body });
  return NextResponse.json(task, { status: 201 });
}

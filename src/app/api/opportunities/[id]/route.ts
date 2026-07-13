import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isProductKey } from "@/lib/products";
import { getPipelineForProduct } from "@/lib/catalog";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const opp = await prisma.opportunity.findUnique({
    where: { id: params.id },
    include: {
      account: true,
      owner: { select: { id: true, name: true } },
      pipeline: { include: { stages: { orderBy: { order: "asc" } } } },
      stageRef: true,
      contacts: { include: { contact: true } },
      activities: {
        include: { contact: true },
        orderBy: { date: "desc" },
      },
      tasks: { orderBy: { dueDate: "asc" } },
    },
  });
  if (!opp) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(opp);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await req.json();
  if (body.value !== undefined) body.value = Number(body.value) || null;
  if (body.probability !== undefined) body.probability = Number(body.probability) || null;
  if (body.expectedCloseDate) body.expectedCloseDate = new Date(body.expectedCloseDate);
  if (body.nextActionDate) body.nextActionDate = new Date(body.nextActionDate);
  if (Array.isArray(body.markets)) body.markets = body.markets.join(",");
  if (body.decisionMakerEngaged !== undefined) {
    body.decisionMakerEngaged =
      body.decisionMakerEngaged === true || body.decisionMakerEngaged === "on";
  }

  const existing = await prisma.opportunity.findUnique({
    where: { id: params.id },
    select: { product: true, stage: true, closedAt: true, pipelineId: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (body.product !== undefined && !isProductKey(body.product)) {
    return NextResponse.json({ error: "Invalid product" }, { status: 400 });
  }

  // Re-resolve the pipeline when the product changes or a stage move occurs.
  const targetProduct: string = body.product ?? existing.product;
  const productChanged = body.product !== undefined && body.product !== existing.product;

  if (productChanged || body.stage !== undefined) {
    const pipeline = await getPipelineForProduct(targetProduct);
    const stageKey: string = body.stage ?? existing.stage;
    const stage =
      pipeline.stages.find((s) => s.key === stageKey) ??
      pipeline.stages.find((s) => s.active && !s.isWon && !s.isLost)!;

    body.pipelineId = pipeline.id;
    body.stageId = stage.id;
    body.stage = stage.key;

    const stageMoved = stage.key !== existing.stage || pipeline.id !== existing.pipelineId;
    if (stageMoved) {
      body.stageChangedAt = new Date();
      if (body.probability === undefined) body.probability = stage.defaultProbability;
    }

    const closing = stage.isWon || stage.isLost;
    if (closing && !existing.closedAt) {
      body.closedAt = new Date();
      body.forecastCategory = "CLOSED";
    }
    if (!closing) body.closedAt = null;
  }

  const opp = await prisma.opportunity.update({
    where: { id: params.id },
    data: body,
  });
  return NextResponse.json(opp);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  await prisma.opportunity.delete({ where: { id: params.id } });
  return new NextResponse(null, { status: 204 });
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isProductKey } from "@/lib/products";
import { cleanProduct } from "@/lib/filters";
import { getPipelineForProduct } from "@/lib/catalog";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const stage = searchParams.get("stage") ?? "";
  const product = cleanProduct(searchParams.get("product"));
  const accountId = searchParams.get("accountId") ?? "";
  const ownerId = searchParams.get("ownerId") ?? "";
  const market = searchParams.get("market") ?? "";

  const opportunities = await prisma.opportunity.findMany({
    where: {
      AND: [
        stage ? { stage } : {},
        product ? { product } : {},
        accountId ? { accountId } : {},
        ownerId ? { ownerId } : {},
        market ? { markets: { contains: market } } : {},
      ],
    },
    include: {
      account: { select: { id: true, name: true, country: true } },
      owner: { select: { id: true, name: true } },
      stageRef: true,
      contacts: { include: { contact: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json(opportunities);
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  if (!body.product || !isProductKey(body.product)) {
    return NextResponse.json(
      { error: "product is required and must be a valid product key" },
      { status: 400 }
    );
  }

  if (body.value !== undefined) body.value = Number(body.value) || null;
  if (body.probability !== undefined) body.probability = Number(body.probability) || null;
  if (body.expectedCloseDate) body.expectedCloseDate = new Date(body.expectedCloseDate);
  if (body.nextActionDate) body.nextActionDate = new Date(body.nextActionDate);
  if (Array.isArray(body.markets)) body.markets = body.markets.join(",");
  body.decisionMakerEngaged = body.decisionMakerEngaged === true || body.decisionMakerEngaged === "on";

  // Resolve the product pipeline and requested (or initial) stage.
  const pipeline = await getPipelineForProduct(body.product);
  const requestedStage = body.stage
    ? pipeline.stages.find((s) => s.key === body.stage)
    : undefined;
  const stage =
    requestedStage ?? pipeline.stages.find((s) => s.active && !s.isWon && !s.isLost)!;

  body.pipelineId = pipeline.id;
  body.stageId = stage.id;
  body.stage = stage.key;
  if (body.probability == null) body.probability = stage.defaultProbability;
  if (stage.isWon || stage.isLost) {
    body.closedAt = new Date();
    body.forecastCategory = "CLOSED";
  }

  const opportunity = await prisma.opportunity.create({
    data: body,
    include: {
      account: { select: { id: true, name: true } },
      stageRef: true,
    },
  });
  return NextResponse.json(opportunity, { status: 201 });
}

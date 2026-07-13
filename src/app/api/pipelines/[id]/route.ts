import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Updates a pipeline: { name?, active?, stages?: [{ id, name?, defaultProbability?, active? }] }
 * Deactivation is guarded when open opportunities still sit on the pipeline.
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await req.json();

  if (body.active === false) {
    const open = await prisma.opportunity.count({
      where: { pipelineId: params.id, closedAt: null },
    });
    if (open > 0) {
      return NextResponse.json(
        { error: `Cannot deactivate: ${open} open opportunit(ies) still use this pipeline.` },
        { status: 409 }
      );
    }
  }

  const data: Record<string, unknown> = {};
  if (body.name !== undefined) data.name = String(body.name).trim();
  if (body.active !== undefined) data.active = Boolean(body.active);

  if (Object.keys(data).length > 0) {
    try {
      await prisma.pipeline.update({ where: { id: params.id }, data });
    } catch {
      return NextResponse.json({ error: "Pipeline not found" }, { status: 404 });
    }
  }

  if (Array.isArray(body.stages)) {
    for (const s of body.stages) {
      if (!s.id) continue;
      const stageData: Record<string, unknown> = {};
      if (s.name !== undefined) stageData.name = String(s.name).trim();
      if (s.defaultProbability !== undefined) {
        stageData.defaultProbability = Math.min(100, Math.max(0, Number(s.defaultProbability) || 0));
      }
      if (s.active !== undefined) {
        if (s.active === false) {
          const inStage = await prisma.opportunity.count({
            where: { stageId: s.id, closedAt: null },
          });
          if (inStage > 0) {
            return NextResponse.json(
              { error: `Cannot deactivate stage: ${inStage} open opportunit(ies) are in it.` },
              { status: 409 }
            );
          }
        }
        stageData.active = Boolean(s.active);
      }
      if (Object.keys(stageData).length > 0) {
        await prisma.pipelineStage.update({
          where: { id: s.id },
          data: stageData,
        });
      }
    }
  }

  const pipeline = await prisma.pipeline.findUnique({
    where: { id: params.id },
    include: { stages: { orderBy: { order: "asc" } } },
  });
  return NextResponse.json(pipeline);
}

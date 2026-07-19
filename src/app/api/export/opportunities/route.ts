export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cleanProduct } from "@/lib/filters";
import { productLabel } from "@/lib/products";

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const product = cleanProduct(searchParams.get("product"));
  const ownerId = searchParams.get("ownerId") ?? "";
  const market = searchParams.get("market") ?? "";
  const stage = searchParams.get("stage") ?? "";

  const opps = await prisma.opportunity.findMany({
    where: {
      AND: [
        product ? { product } : {},
        ownerId ? { ownerId } : {},
        market ? { markets: { contains: market } } : {},
        stage ? { stage } : {},
      ],
    },
    include: {
      account: { select: { name: true } },
      owner: { select: { name: true } },
      stageRef: { select: { name: true } },
      pipeline: { select: { name: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  const header = [
    "name", "account", "product", "pipeline", "stage", "value", "probability",
    "forecastCategory", "healthStatus", "markets", "owner",
    "nextAction", "nextActionDate", "expectedCloseDate", "closedAt", "createdAt",
  ];
  const rows = opps.map((o) =>
    [
      o.name, o.account.name, productLabel(o.product), o.pipeline?.name ?? "",
      o.stageRef?.name ?? o.stage, o.value, o.probability,
      o.forecastCategory, o.healthStatus, o.markets, o.owner?.name ?? "",
      o.nextAction,
      o.nextActionDate?.toISOString().split("T")[0] ?? "",
      o.expectedCloseDate?.toISOString().split("T")[0] ?? "",
      o.closedAt?.toISOString().split("T")[0] ?? "",
      o.createdAt.toISOString().split("T")[0],
    ].map(csvCell).join(",")
  );

  const csv = [header.join(","), ...rows].join("\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="arqone-pipeline-${new Date().toISOString().split("T")[0]}.csv"`,
    },
  });
}

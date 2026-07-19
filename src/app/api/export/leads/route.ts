export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cleanProduct, leadProductWhere } from "@/lib/filters";
import { productLabel } from "@/lib/products";

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const product = cleanProduct(searchParams.get("product"));
  const status = searchParams.get("status") ?? "";
  const markets = searchParams.get("markets") ?? "";
  const ownerId = searchParams.get("ownerId") ?? "";
  const motion = searchParams.get("motion") ?? "";
  const source = searchParams.get("source") ?? "";
  const search = searchParams.get("search") ?? "";

  const leads = await prisma.lead.findMany({
    where: {
      AND: [
        search
          ? { OR: [{ name: { contains: search } }, { company: { contains: search } }] }
          : {},
        status ? { status } : {},
        markets ? { markets: { contains: markets } } : {},
        leadProductWhere(product),
        ownerId ? { ownerId } : {},
        motion ? { salesMotion: motion } : {},
        source ? { source } : {},
      ],
    },
    include: { owner: { select: { name: true } } },
    orderBy: [{ score: "desc" }, { createdAt: "desc" }],
  });

  const header = [
    "name", "company", "title", "email", "phone", "primaryProduct", "secondaryProducts",
    "markets", "source", "salesMotion", "status", "score", "estimatedValue",
    "owner", "nextAction", "nextActionDate", "createdAt",
  ];
  const rows = leads.map((l) =>
    [
      l.name, l.company, l.title, l.email, l.phone,
      productLabel(l.primaryProduct),
      (l.secondaryProducts ?? "").split(",").filter(Boolean).map(productLabel).join("; "),
      l.markets, l.source, l.salesMotion, l.status, l.score, l.estimatedValue,
      l.owner?.name ?? "", l.nextAction,
      l.nextActionDate?.toISOString().split("T")[0] ?? "",
      l.createdAt.toISOString().split("T")[0],
    ].map(csvCell).join(",")
  );

  const csv = [header.join(","), ...rows].join("\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="arqone-leads-${new Date().toISOString().split("T")[0]}.csv"`,
    },
  });
}

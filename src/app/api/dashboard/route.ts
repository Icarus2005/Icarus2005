import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const [
    totalAccounts,
    totalContacts,
    openOpportunities,
    recentActivities,
    pipelineByStage,
    dealsByCountry,
  ] = await Promise.all([
    prisma.account.count(),
    prisma.contact.count(),
    prisma.opportunity.findMany({
      where: { stage: { notIn: ["CLOSED_WON", "CLOSED_LOST"] } },
      select: { value: true, stage: true },
    }),
    prisma.activity.findMany({
      take: 10,
      orderBy: { date: "desc" },
      include: {
        account: { select: { id: true, name: true } },
        contact: { select: { id: true, firstName: true, lastName: true } },
        opportunity: { select: { id: true, name: true } },
      },
    }),
    prisma.opportunity.groupBy({
      by: ["stage"],
      _count: { id: true },
      _sum: { value: true },
    }),
    prisma.account.groupBy({
      by: ["country"],
      _count: { id: true },
    }),
  ]);

  const pipelineValue = openOpportunities.reduce(
    (sum, o) => sum + (o.value ?? 0),
    0
  );

  const wonThisQuarter = await prisma.opportunity.findMany({
    where: {
      stage: "CLOSED_WON",
      updatedAt: {
        gte: new Date(new Date().getFullYear(), Math.floor(new Date().getMonth() / 3) * 3, 1),
      },
    },
    select: { value: true },
  });
  const wonValue = wonThisQuarter.reduce((sum, o) => sum + (o.value ?? 0), 0);

  return NextResponse.json({
    totalAccounts,
    totalContacts,
    openDeals: openOpportunities.length,
    pipelineValue,
    wonValue,
    recentActivities,
    pipelineByStage,
    dealsByCountry,
  });
}

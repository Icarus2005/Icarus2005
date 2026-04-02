import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const accountId = searchParams.get("accountId") ?? "";
  const opportunityId = searchParams.get("opportunityId") ?? "";
  const type = searchParams.get("type") ?? "";

  const activities = await prisma.activity.findMany({
    where: {
      AND: [
        accountId ? { accountId } : {},
        opportunityId ? { opportunityId } : {},
        type ? { type } : {},
      ],
    },
    include: {
      account: { select: { id: true, name: true } },
      contact: { select: { id: true, firstName: true, lastName: true } },
      opportunity: { select: { id: true, name: true } },
    },
    orderBy: { date: "desc" },
  });

  return NextResponse.json(activities);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const activity = await prisma.activity.create({
    data: body,
    include: {
      account: { select: { id: true, name: true } },
      contact: { select: { id: true, firstName: true, lastName: true } },
      opportunity: { select: { id: true, name: true } },
    },
  });
  return NextResponse.json(activity, { status: 201 });
}

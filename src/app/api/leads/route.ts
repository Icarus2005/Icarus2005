import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") ?? "";
  const status = searchParams.get("status") ?? "";
  const markets = searchParams.get("markets") ?? "";

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
      ],
    },
    orderBy: [{ score: "desc" }, { createdAt: "desc" }],
  });

  return NextResponse.json(leads);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (body.score !== undefined) body.score = Number(body.score) || null;
  const lead = await prisma.lead.create({ data: body });
  return NextResponse.json(lead, { status: 201 });
}

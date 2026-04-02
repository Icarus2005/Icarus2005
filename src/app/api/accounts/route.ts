import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") ?? "";
  const country = searchParams.get("country") ?? "";
  const sector = searchParams.get("sector") ?? "";

  const accounts = await prisma.account.findMany({
    where: {
      AND: [
        search ? { name: { contains: search } } : {},
        country ? { country } : {},
        sector ? { sector } : {},
      ],
    },
    include: {
      _count: { select: { contacts: true, opportunities: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(accounts);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const account = await prisma.account.create({ data: body });
  return NextResponse.json(account, { status: 201 });
}

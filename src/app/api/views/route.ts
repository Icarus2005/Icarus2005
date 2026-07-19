export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const VALID_PAGES = ["leads", "opportunities", "accounts", "contacts", "tasks", "activities"];

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const page = searchParams.get("page") ?? "";
  const views = await prisma.savedView.findMany({
    where: page ? { page } : {},
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(views);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const name = String(body.name ?? "").trim();
  const page = String(body.page ?? "").trim();
  const query = String(body.query ?? "").trim();

  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (name.length > 40) return NextResponse.json({ error: "Name is too long (max 40 chars)" }, { status: 400 });
  if (!VALID_PAGES.includes(page)) {
    return NextResponse.json({ error: "Invalid page" }, { status: 400 });
  }

  // Same name on the same page replaces the stored query
  const view = await prisma.savedView.upsert({
    where: { page_name: { page, name } },
    update: { query },
    create: { name, page, query },
  });
  return NextResponse.json(view, { status: 201 });
}

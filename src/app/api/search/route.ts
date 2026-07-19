export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Global search across leads, accounts, contacts, and opportunities.
 * Returns a compact, typed result list for the command palette.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ results: [] });

  const [leads, accounts, contacts, opportunities] = await Promise.all([
    prisma.lead.findMany({
      where: {
        OR: [
          { name: { contains: q } },
          { company: { contains: q } },
          { email: { contains: q } },
        ],
      },
      select: { id: true, name: true, company: true, primaryProduct: true, status: true },
      take: 5,
    }),
    prisma.account.findMany({
      where: { OR: [{ name: { contains: q } }, { industry: { contains: q } }] },
      select: { id: true, name: true, industry: true },
      take: 5,
    }),
    prisma.contact.findMany({
      where: {
        OR: [
          { firstName: { contains: q } },
          { lastName: { contains: q } },
          { email: { contains: q } },
        ],
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        title: true,
        account: { select: { name: true } },
      },
      take: 5,
    }),
    prisma.opportunity.findMany({
      where: { name: { contains: q } },
      select: {
        id: true,
        name: true,
        product: true,
        value: true,
        account: { select: { name: true } },
        stageRef: { select: { name: true } },
      },
      take: 5,
    }),
  ]);

  const results = [
    ...leads.map((l) => ({
      type: "lead" as const,
      id: l.id,
      title: l.name,
      subtitle: [l.company, l.status].filter(Boolean).join(" · "),
      product: l.primaryProduct,
      href: `/leads/${l.id}`,
    })),
    ...opportunities.map((o) => ({
      type: "opportunity" as const,
      id: o.id,
      title: o.name,
      subtitle: [o.account.name, o.stageRef?.name].filter(Boolean).join(" · "),
      product: o.product,
      href: `/opportunities/${o.id}`,
    })),
    ...accounts.map((a) => ({
      type: "account" as const,
      id: a.id,
      title: a.name,
      subtitle: a.industry ?? "",
      product: null,
      href: `/accounts/${a.id}`,
    })),
    ...contacts.map((c) => ({
      type: "contact" as const,
      id: c.id,
      title: `${c.firstName} ${c.lastName}`,
      subtitle: [c.title, c.account?.name].filter(Boolean).join(" · "),
      product: null,
      href: `/contacts/${c.id}`,
    })),
  ];

  return NextResponse.json({ results });
}

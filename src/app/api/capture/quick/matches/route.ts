import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeName } from "@/lib/normalize";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 150) : "";
  const company = typeof body?.company === "string" ? body.company.trim().slice(0, 150) : "";
  const email = typeof body?.email === "string" ? body.email.trim().slice(0, 200) : "";
  const phone = typeof body?.phone === "string" ? body.phone.trim().slice(0, 100) : "";
  const accountCandidates = company ? await prisma.account.findMany({ where: { name: { contains: company, mode: "insensitive" } }, select: { id: true, name: true }, take: 20 }) : [];
  const accounts = accountCandidates.filter((a) => normalizeName(a.name) === normalizeName(company));
  const identity = [
    ...(email ? [{ email: { equals: email, mode: "insensitive" as const } }] : []),
    ...(phone ? [{ phone }] : []),
  ];
  const contacts = await prisma.contact.findMany({
    where: identity.length ? { OR: identity } : name ? { firstName: { contains: name.split(/\s+/)[0], mode: "insensitive" } } : { id: "__none__" },
    include: { account: { select: { id: true, name: true } } }, take: 100,
  });
  const exactIdentity = Boolean(email || phone);
  const matches = contacts.filter((c) => exactIdentity || normalizeName(`${c.firstName} ${c.lastName}`) === normalizeName(name))
    .filter((c) => exactIdentity || !company || accounts.some((a) => a.id === c.accountId) || contacts.length === 1)
    .map((c) => ({ id: c.id, name: `${c.firstName} ${c.lastName}`.trim(), company: c.account.name, accountId: c.accountId, reason: email && c.email?.toLowerCase() === email.toLowerCase() ? "email" : phone && c.phone === phone ? "phone" : company && normalizeName(c.account.name) === normalizeName(company) ? "name + company" : "name" }));
  return NextResponse.json({ accounts, contacts: matches.slice(0, 10) });
}

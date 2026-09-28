import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeName } from "@/lib/normalize";
import { extractCaptureContext } from "@/lib/capture/extract";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const transcript = typeof body?.transcript === "string" ? body.transcript.trim() : "";
  if (!transcript || transcript.length > 5000) return NextResponse.json({ error: "Debrief must be 1–5000 characters." }, { status: 400 });

  const suggestion = await extractCaptureContext(transcript);
  const name = suggestion?.personName;
  const company = suggestion?.companyName;
  const accounts = company ? await prisma.account.findMany({ where: { name: { contains: company, mode: "insensitive" } }, select: { id: true, name: true }, take: 10 }) : [];
  const accountMatches = accounts.filter((account) => normalizeName(account.name) === normalizeName(company!));
  const contacts = name ? await prisma.contact.findMany({
    where: {
      firstName: { contains: name.split(/\s+/)[0], mode: "insensitive" },
      ...(accountMatches.length ? { accountId: { in: accountMatches.map((account) => account.id) } } : {}),
    },
    include: { account: { select: { name: true } } },
    take: 100,
  }) : [];
  const contactMatches = contacts.filter((contact) => normalizeName(`${contact.firstName} ${contact.lastName}`) === normalizeName(name!));
  return NextResponse.json({
    suggestion,
    extractionAvailable: suggestion !== null,
    accountMatches,
    contactMatches: contactMatches.map((contact) => ({ id: contact.id, name: `${contact.firstName} ${contact.lastName}`, company: contact.account.name, accountId: contact.accountId })),
  });
}

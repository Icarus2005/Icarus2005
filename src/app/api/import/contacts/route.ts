import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { planContactImport } from "@/lib/contactImport";

// Expected CSV columns:
// firstName, lastName, accountName, email, phone, title, role
//
// Deduplication: contacts are matched by email before any create — both
// against existing contacts and against earlier rows in the same file. A
// match is never silently dropped: it is reported as a clear
// "skipped-duplicate" warning naming the existing contact, and no duplicate
// person is created. Rows without an email cannot be deduplicated and are
// always created. See src/lib/contactImport.ts for the (unit-tested)
// decision logic.
export async function POST(req: NextRequest) {
  const rows: Record<string, string>[] = await req.json();

  const [accounts, existingContacts] = await Promise.all([
    prisma.account.findMany({ select: { id: true, name: true } }),
    prisma.contact.findMany({
      where: { email: { not: null } },
      select: { id: true, firstName: true, lastName: true, email: true },
    }),
  ]);
  const accountMap = new Map(accounts.map((a) => [a.name.toLowerCase().trim(), a.id]));
  const existingByEmail = new Map(
    existingContacts.map((c) => [c.email!.toLowerCase(), { id: c.id, firstName: c.firstName, lastName: c.lastName }])
  );

  const plan = planContactImport(rows, accountMap, existingByEmail);

  const results = {
    created: 0,
    skipped: 0,
    duplicates: 0,
    errors: [] as string[],
    warnings: [] as string[],
  };

  for (const item of plan) {
    if (item.outcome === "error") {
      results.errors.push(item.message);
      results.skipped++;
      continue;
    }
    if (item.outcome === "duplicate") {
      results.warnings.push(item.message);
      results.duplicates++;
      results.skipped++;
      continue;
    }
    try {
      await prisma.contact.create({ data: item.data });
      results.created++;
    } catch {
      results.errors.push(`Failed to create contact "${item.data.firstName} ${item.data.lastName}"`);
      results.skipped++;
    }
  }

  return NextResponse.json(results);
}

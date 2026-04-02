import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Expected CSV columns:
// firstName, lastName, accountName, email, phone, title, role
export async function POST(req: NextRequest) {
  const rows: Record<string, string>[] = await req.json();

  // Build account name → id lookup
  const accounts = await prisma.account.findMany({ select: { id: true, name: true } });
  const accountMap = new Map(accounts.map((a) => [a.name.toLowerCase().trim(), a.id]));

  const results = { created: 0, skipped: 0, errors: [] as string[] };

  for (const row of rows) {
    const firstName = row.firstName?.trim();
    const lastName = row.lastName?.trim();
    if (!firstName || !lastName) {
      results.errors.push(`Row skipped: missing firstName or lastName`);
      results.skipped++;
      continue;
    }

    const accountName = row.accountName?.trim();
    const accountId = accountName ? accountMap.get(accountName.toLowerCase()) : null;

    if (accountName && !accountId) {
      results.errors.push(`Contact "${firstName} ${lastName}" skipped: account "${accountName}" not found — import accounts first`);
      results.skipped++;
      continue;
    }

    if (!accountId) {
      results.errors.push(`Contact "${firstName} ${lastName}" skipped: accountName is required`);
      results.skipped++;
      continue;
    }

    try {
      await prisma.contact.create({
        data: {
          firstName,
          lastName,
          accountId,
          email: row.email?.trim() || null,
          phone: row.phone?.trim() || null,
          title: row.title?.trim() || null,
          role: row.role?.trim() || null,
        },
      });
      results.created++;
    } catch {
      results.errors.push(`Failed to create contact "${firstName} ${lastName}"`);
      results.skipped++;
    }
  }

  return NextResponse.json(results);
}

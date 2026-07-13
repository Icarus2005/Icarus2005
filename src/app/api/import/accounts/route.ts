import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { COUNTRIES } from "@/lib/constants";

// Expected CSV columns:
// name, country, sector, industry, size, tier, ownerEmail, website, description
export async function POST(req: NextRequest) {
  const rows: Record<string, string>[] = await req.json();

  const team = await prisma.teamMember.findMany({ select: { id: true, email: true } });
  const teamMap = new Map(team.map((m) => [m.email.toLowerCase(), m.id]));

  const results = { created: 0, skipped: 0, errors: [] as string[], warnings: [] as string[] };

  for (const row of rows) {
    const name = row.name?.trim();
    if (!name) {
      results.errors.push(`Row skipped: missing name`);
      results.skipped++;
      continue;
    }

    // Accounts are matched by name — never duplicated
    const existing = await prisma.account.findUnique({ where: { name } });
    if (existing) {
      results.warnings.push(`Account "${name}" already exists — skipped (accounts are never duplicated).`);
      results.skipped++;
      continue;
    }

    const country = row.country?.trim().toUpperCase();
    const ownerEmail = row.ownerEmail?.trim().toLowerCase();
    const ownerId = ownerEmail ? teamMap.get(ownerEmail) : undefined;
    if (ownerEmail && !ownerId) {
      results.warnings.push(`Account "${name}": owner "${ownerEmail}" not found — imported unowned.`);
    }

    try {
      await prisma.account.create({
        data: {
          name,
          country: country && country in COUNTRIES ? country : "AE",
          sector: row.sector?.trim().toUpperCase() || "PRIVATE",
          industry: row.industry?.trim() || null,
          size: row.size?.trim().toUpperCase() || null,
          tier: row.tier?.trim().toUpperCase() || null,
          ownerId: ownerId ?? null,
          website: row.website?.trim() || null,
          description: row.description?.trim() || null,
        },
      });
      results.created++;
    } catch {
      results.errors.push(`Failed to create account "${name}"`);
      results.skipped++;
    }
  }

  return NextResponse.json(results);
}

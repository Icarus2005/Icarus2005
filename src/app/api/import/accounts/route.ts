import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Expected CSV columns:
// name, country, sector, industry, size, website, description
export async function POST(req: NextRequest) {
  const rows: Record<string, string>[] = await req.json();

  const results = { created: 0, skipped: 0, errors: [] as string[] };

  for (const row of rows) {
    const name = row.name?.trim();
    if (!name) {
      results.errors.push(`Row skipped: missing name`);
      results.skipped++;
      continue;
    }
    try {
      await prisma.account.create({
        data: {
          name,
          country: row.country?.trim() || "UAE",
          sector: row.sector?.trim() || "PRIVATE",
          industry: row.industry?.trim() || null,
          size: row.size?.trim() || null,
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

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Expected CSV columns:
// name, accountName, stage, type, value, probability, expectedCloseDate, notes
export async function POST(req: NextRequest) {
  const rows: Record<string, string>[] = await req.json();

  // Build account name → id lookup
  const accounts = await prisma.account.findMany({ select: { id: true, name: true } });
  const accountMap = new Map(accounts.map((a) => [a.name.toLowerCase().trim(), a.id]));

  const VALID_STAGES = ["IDENTIFIED", "QUALIFIED", "DEMO_SCHEDULED", "PROPOSAL_SENT", "NEGOTIATION", "CLOSED_WON", "CLOSED_LOST"];
  const VALID_TYPES = ["MAYA", "METRICS_PRO", "CONSULTING", "OTHER"];

  const results = { created: 0, skipped: 0, errors: [] as string[] };

  for (const row of rows) {
    const name = row.name?.trim();
    if (!name) {
      results.errors.push(`Row skipped: missing deal name`);
      results.skipped++;
      continue;
    }

    const accountName = row.accountName?.trim();
    const accountId = accountName ? accountMap.get(accountName.toLowerCase()) : null;

    if (!accountId) {
      results.errors.push(`Deal "${name}" skipped: account "${accountName}" not found — import accounts first`);
      results.skipped++;
      continue;
    }

    const stage = row.stage?.trim().toUpperCase();
    const type = row.type?.trim().toUpperCase();

    const rawValue = row.value?.trim().replace(/[^0-9.]/g, "");
    const value = rawValue ? parseFloat(rawValue) : null;
    const probability = row.probability?.trim() ? parseInt(row.probability.replace(/[^0-9]/g, "")) : null;

    let expectedCloseDate: Date | null = null;
    if (row.expectedCloseDate?.trim()) {
      const parsed = new Date(row.expectedCloseDate.trim());
      if (!isNaN(parsed.getTime())) expectedCloseDate = parsed;
    }

    try {
      await prisma.opportunity.create({
        data: {
          name,
          accountId,
          stage: VALID_STAGES.includes(stage) ? stage : "IDENTIFIED",
          type: VALID_TYPES.includes(type) ? type : "OTHER",
          value: value && !isNaN(value) ? value : null,
          probability: probability && !isNaN(probability) ? Math.min(100, Math.max(0, probability)) : null,
          expectedCloseDate,
          notes: row.notes?.trim() || null,
        },
      });
      results.created++;
    } catch {
      results.errors.push(`Failed to create deal "${name}"`);
      results.skipped++;
    }
  }

  return NextResponse.json(results);
}

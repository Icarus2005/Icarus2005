import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isProductKey } from "@/lib/products";
import { COUNTRIES } from "@/lib/constants";
import { getPipelines } from "@/lib/catalog";

// Expected CSV columns:
// name, accountName, product, stage, value, probability, markets, ownerEmail,
// expectedCloseDate, nextAction, nextActionDate, notes
export async function POST(req: NextRequest) {
  const rows: Record<string, string>[] = await req.json();

  const [accounts, team, pipelines] = await Promise.all([
    prisma.account.findMany({ select: { id: true, name: true } }),
    prisma.teamMember.findMany({ select: { id: true, email: true } }),
    getPipelines(),
  ]);
  const accountMap = new Map(accounts.map((a) => [a.name.toLowerCase().trim(), a.id]));
  const teamMap = new Map(team.map((m) => [m.email.toLowerCase(), m.id]));

  const results = { created: 0, skipped: 0, errors: [] as string[], warnings: [] as string[] };

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

    // Product mapping — unknown values become UNASSIGNED with a warning
    let product = row.product?.trim().toUpperCase() || "";
    if (!product) {
      product = "UNASSIGNED";
      results.warnings.push(`Deal "${name}": no product — imported as UNASSIGNED.`);
    } else if (!isProductKey(product)) {
      results.warnings.push(`Deal "${name}": unknown product "${row.product}" — imported as UNASSIGNED.`);
      product = "UNASSIGNED";
    }

    // Resolve the product pipeline + stage
    const pipeline =
      pipelines.find((p) => p.productKey === product && p.active) ??
      pipelines.find((p) => p.productKey === "UNASSIGNED")!;
    const stageKey = row.stage?.trim().toUpperCase();
    let stage = stageKey ? pipeline.stages.find((s) => s.key === stageKey) : undefined;
    if (stageKey && !stage) {
      results.warnings.push(
        `Deal "${name}": stage "${stageKey}" is not on the ${pipeline.name} pipeline — placed in the first open stage.`
      );
    }
    if (!stage) stage = pipeline.stages.find((s) => s.active && !s.isWon && !s.isLost)!;

    const ownerEmail = row.ownerEmail?.trim().toLowerCase();
    const ownerId = ownerEmail ? teamMap.get(ownerEmail) : undefined;
    if (ownerEmail && !ownerId) {
      results.warnings.push(`Deal "${name}": owner "${ownerEmail}" not found — imported unowned.`);
    }

    const markets = (row.markets ?? "")
      .split(",")
      .map((m) => m.trim().toUpperCase())
      .filter((m) => m in COUNTRIES);

    const rawValue = row.value?.trim().replace(/[^0-9.]/g, "");
    const value = rawValue ? parseFloat(rawValue) : null;
    const probability = row.probability?.trim()
      ? parseInt(row.probability.replace(/[^0-9]/g, ""))
      : null;

    const parseDate = (v?: string) => {
      if (!v?.trim()) return null;
      const d = new Date(v.trim());
      return isNaN(d.getTime()) ? null : d;
    };

    try {
      await prisma.opportunity.create({
        data: {
          name,
          accountId,
          product,
          pipelineId: pipeline.id,
          stageId: stage.id,
          stage: stage.key,
          value: value && !isNaN(value) ? value : null,
          probability:
            probability != null && !isNaN(probability)
              ? Math.min(100, Math.max(0, probability))
              : stage.defaultProbability,
          markets: markets.length ? markets.join(",") : "AE",
          ownerId: ownerId ?? null,
          expectedCloseDate: parseDate(row.expectedCloseDate),
          nextAction: row.nextAction?.trim() || null,
          nextActionDate: parseDate(row.nextActionDate),
          closedAt: stage.isWon || stage.isLost ? new Date() : null,
          forecastCategory: stage.isWon || stage.isLost ? "CLOSED" : "PIPELINE",
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

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isProductKey } from "@/lib/products";
import { COUNTRIES } from "@/lib/constants";
import { resolveLeadSource, resolveUseCase } from "@/lib/leadImport";

// Expected CSV columns:
// name, company, title, email, phone, primaryProduct, secondaryProducts,
// markets, sourceType, sourceDetail, salesMotion, useCase, status, score,
// estimatedValue, ownerEmail, notes
//
// `source` (the old flat column) is still accepted for back-compat: if
// sourceType is absent but source is present and matches a known source
// type, it is used as sourceType. Nothing from a valid row is ever silently
// dropped — unrecognized sourceType/useCase values are kept as-is (useCase
// is intentionally extensible) or flagged with a warning (sourceType is a
// fixed set), never discarded.
export async function POST(req: NextRequest) {
  const rows: Record<string, string>[] = await req.json();

  const team = await prisma.teamMember.findMany({ select: { id: true, email: true } });
  const teamMap = new Map(team.map((m) => [m.email.toLowerCase(), m.id]));

  const results = { created: 0, skipped: 0, errors: [] as string[], warnings: [] as string[] };
  const VALID_STATUSES = ["NEW", "CONTACTED", "QUALIFIED", "DISQUALIFIED"];

  for (const row of rows) {
    const name = row.name?.trim();
    if (!name) {
      results.errors.push(`Row skipped: missing name`);
      results.skipped++;
      continue;
    }

    // Duplicate protection by email
    const email = row.email?.trim() || null;
    if (email) {
      const dupe = await prisma.lead.findFirst({ where: { email } });
      if (dupe) {
        results.warnings.push(`Lead "${name}" skipped: a lead with email ${email} already exists.`);
        results.skipped++;
        continue;
      }
    }

    // Product mapping — never silent: unknown values become UNASSIGNED with a warning
    let primaryProduct = row.primaryProduct?.trim().toUpperCase() || "";
    if (!primaryProduct) {
      primaryProduct = "UNASSIGNED";
      results.warnings.push(`Lead "${name}": no primaryProduct — imported as UNASSIGNED.`);
    } else if (!isProductKey(primaryProduct)) {
      results.warnings.push(`Lead "${name}": unknown product "${row.primaryProduct}" — imported as UNASSIGNED.`);
      primaryProduct = "UNASSIGNED";
    }

    const secondary = (row.secondaryProducts ?? "")
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean)
      .filter((s) => {
        if (!isProductKey(s) || s === "UNASSIGNED") {
          results.warnings.push(`Lead "${name}": unknown secondary product "${s}" — dropped.`);
          return false;
        }
        return s !== primaryProduct;
      });

    const markets = (row.markets ?? "")
      .split(",")
      .map((m) => m.trim().toUpperCase())
      .filter((m) => m in COUNTRIES);

    const ownerEmail = row.ownerEmail?.trim().toLowerCase();
    const ownerId = ownerEmail ? teamMap.get(ownerEmail) : undefined;
    if (ownerEmail && !ownerId) {
      results.warnings.push(`Lead "${name}": owner "${ownerEmail}" not found — imported unowned.`);
    }

    const status = row.status?.trim().toUpperCase();
    const score = row.score?.trim() ? parseInt(row.score.replace(/[^0-9]/g, "")) : null;
    const estimatedValue = row.estimatedValue?.trim()
      ? parseFloat(row.estimatedValue.replace(/[^0-9.]/g, ""))
      : null;

    const { sourceType, warning: sourceWarning } = resolveLeadSource(row, name);
    if (sourceWarning) results.warnings.push(sourceWarning);
    const sourceDetail = row.sourceDetail?.trim() || null;

    const { useCase, warning: useCaseWarning } = resolveUseCase(row.useCase, `Lead "${name}"`);
    if (useCaseWarning) results.warnings.push(useCaseWarning);

    try {
      await prisma.lead.create({
        data: {
          name,
          company: row.company?.trim() || null,
          title: row.title?.trim() || null,
          email,
          phone: row.phone?.trim() || null,
          primaryProduct,
          secondaryProducts: secondary.length ? secondary.join(",") : null,
          markets: markets.length ? markets.join(",") : "AE",
          source: row.source?.trim().toUpperCase() || null,
          sourceType,
          sourceDetail,
          salesMotion: row.salesMotion?.trim().toUpperCase() || null,
          useCase,
          status: status && VALID_STATUSES.includes(status) ? status : "NEW",
          score: score != null && !isNaN(score) ? Math.min(100, Math.max(0, score)) : null,
          estimatedValue: estimatedValue != null && !isNaN(estimatedValue) ? estimatedValue : null,
          ownerId: ownerId ?? null,
          notes: row.notes?.trim() || null,
        },
      });
      results.created++;
    } catch {
      results.errors.push(`Failed to create lead "${name}"`);
      results.skipped++;
    }
  }

  return NextResponse.json(results);
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Handles the IRL MENAT pipeline sheet format:
// CLIENT | DATE | CLIENT NAME | Discussion | TYPE | PRIORITY | VALUE $ | SALES CYCLE | RETAINER | Next Steps | ACTION [Piero]

function parseValue(raw: string): number | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  if (s === "on going" || s === "na yet" || s === "" || s === "-") return null;
  // Handle "982K x 3yr" → take first number part
  const firstNum = s.split(/x|\*/i)[0].trim();
  const clean = firstNum.replace(/[^0-9.km]/gi, "");
  if (!clean) return null;
  let val = parseFloat(clean);
  if (isNaN(val)) return null;
  if (firstNum.toLowerCase().includes("m")) val *= 1_000_000;
  else if (firstNum.toLowerCase().includes("k")) val *= 1_000;
  return val;
}

function parseStage(priority: string, value: string): string {
  const p = priority?.trim();
  const v = value?.trim().toLowerCase();
  if (v === "na yet" || v === "") return "IDENTIFIED";
  if (p === "1") return "NEGOTIATION";
  if (p === "2") return "PROPOSAL_SENT";
  if (p === "3") return "QUALIFIED";
  return "IDENTIFIED";
}

function splitName(fullName: string): { firstName: string; lastName: string } {
  // Handle "First / Second" → take first person
  const primary = fullName.split(/\/|;/)[0].trim();
  // Handle "First Last" or "Last, First"
  if (primary.includes(",")) {
    const [last, first] = primary.split(",").map((s) => s.trim());
    return { firstName: first || last, lastName: last };
  }
  const parts = primary.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

function inferCountry(discussion: string, type: string): string {
  const text = `${discussion} ${type}`.toLowerCase();
  if (text.includes("riyadh") || text.includes("saudi") || text.includes("ksa")) return "SAUDI_ARABIA";
  if (text.includes("dubai") || text.includes("abu dhabi") || text.includes("uae")) return "UAE";
  if (text.includes("qatar") || text.includes("doha")) return "QATAR";
  if (text.includes("kuwait")) return "KUWAIT";
  if (text.includes("bahrain")) return "BAHRAIN";
  if (text.includes("oman") || text.includes("muscat")) return "OMAN";
  return "UAE"; // default
}

export async function POST(req: NextRequest) {
  const rows: Record<string, string>[] = await req.json();

  const results = {
    accounts: 0,
    contacts: 0,
    opportunities: 0,
    skipped: 0,
    errors: [] as string[],
  };

  for (const row of rows) {
    const clientName = row["CLIENT"]?.trim() || row["client"]?.trim();
    if (!clientName) {
      results.skipped++;
      continue;
    }

    const contactFullName = row["CLIENT NAME"]?.trim() || row["client name"]?.trim() || "";
    const discussion = row["Discussion"]?.trim() || row["discussion"]?.trim() || "";
    const type = row["TYPE"]?.trim() || row["type"]?.trim() || "";
    const priority = row["PRIORITY"]?.trim() || row["priority"]?.trim() || "";
    const rawValue = row["VALUE $"]?.trim() || row["value $"]?.trim() || row["VALUE"]?.trim() || "";
    const salesCycle = row["SALES CYCLE"]?.trim() || row["sales cycle"]?.trim() || "";
    const retainer = row["RETAINER"]?.trim() || row["retainer"]?.trim() || "";
    const nextSteps = row["Next Steps"]?.trim() || row["next steps"]?.trim() || "";
    const action = row["ACTION [Piero]"]?.trim() || row["action [piero]"]?.trim() || "";

    try {
      // 1. Upsert Account (find or create by name)
      let account = await prisma.account.findFirst({
        where: { name: { equals: clientName } },
      });

      if (!account) {
        account = await prisma.account.create({
          data: {
            name: clientName,
            country: inferCountry(discussion, type),
            sector: "PRIVATE",
            description: [
              type ? `Channel: ${type}` : "",
              salesCycle ? `Sales Cycle: ${salesCycle}` : "",
              retainer === "Yes" ? "Retainer: Yes" : "",
            ]
              .filter(Boolean)
              .join(" | ") || null,
          },
        });
        results.accounts++;
      }

      // 2. Create Contact if name is present
      if (contactFullName) {
        const { firstName, lastName } = splitName(contactFullName);
        const email =
          row["email"]?.trim() ||
          // check if any field looks like an email
          Object.values(row).find((v) => v?.includes("@")) ||
          null;

        // Avoid duplicate contacts for same account
        const existing = await prisma.contact.findFirst({
          where: { accountId: account.id, firstName, lastName },
        });

        if (!existing) {
          await prisma.contact.create({
            data: {
              firstName,
              lastName: lastName || "-",
              accountId: account.id,
              email: email || null,
              role: priority === "1" ? "DECISION_MAKER" : "OTHER",
            },
          });
          results.contacts++;
        }
      }

      // 3. Create Opportunity
      const value = parseValue(rawValue);
      const stage = parseStage(priority, rawValue);

      // Build notes from all context fields
      const notesParts = [
        discussion ? `Context: ${discussion}` : "",
        nextSteps ? `Next Steps: ${nextSteps}` : "",
        action ? `Action (Piero): ${action}` : "",
        type ? `Channel: ${type}` : "",
        salesCycle ? `Sales Cycle: ${salesCycle}` : "",
        retainer === "Yes" ? "Retainer deal" : "",
      ].filter(Boolean);

      await prisma.opportunity.create({
        data: {
          name: clientName,
          accountId: account.id,
          stage,
          type: "OTHER",
          value,
          probability:
            stage === "NEGOTIATION" ? 75
            : stage === "PROPOSAL_SENT" ? 50
            : stage === "QUALIFIED" ? 30
            : 10,
          notes: notesParts.join("\n") || null,
        },
      });
      results.opportunities++;
    } catch (err) {
      results.errors.push(`Failed to import row "${clientName}": ${String(err)}`);
      results.skipped++;
    }
  }

  return NextResponse.json(results);
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Converts a lead into Account + Contact + Opportunity.
// - Account: found by company name, or created
// - Contact: created from the lead's person details
// - Opportunity: created at IDENTIFIED with the lead's product interest
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const lead = await prisma.lead.findUnique({ where: { id: params.id } });
  if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (lead.convertedOpportunityId) {
    return NextResponse.json(
      { error: "Lead already converted", opportunityId: lead.convertedOpportunityId },
      { status: 409 }
    );
  }

  const companyName = lead.company?.trim() || lead.name;

  let account = await prisma.account.findFirst({
    where: { name: companyName },
  });
  if (!account) {
    account = await prisma.account.create({
      data: {
        name: companyName,
        country: lead.markets,
        industry: lead.sector || null,
        description: lead.notes || null,
      },
    });
  }

  // Split lead name into first/last for the contact record
  const parts = lead.name.trim().split(/\s+/);
  const firstName = parts[0];
  const lastName = parts.slice(1).join(" ") || "-";

  const contact = await prisma.contact.create({
    data: {
      firstName,
      lastName,
      email: lead.email || null,
      phone: lead.phone || null,
      title: lead.title || null,
      accountId: account.id,
    },
  });

  const opportunity = await prisma.opportunity.create({
    data: {
      name: `${TYPE_LABELS[lead.productInterest ?? ""] ?? "New Opportunity"} - ${companyName}`,
      stage: "IDENTIFIED",
      type: lead.productInterest && VALID_TYPES.includes(lead.productInterest) ? lead.productInterest : "OTHER",
      accountId: account.id,
      probability: 10,
      notes: [
        lead.notes ? `From lead: ${lead.notes}` : "",
        lead.source ? `Source: ${lead.source}` : "",
        lead.tags ? `Tags: ${lead.tags}` : "",
      ].filter(Boolean).join("\n") || null,
      contacts: { create: [{ contactId: contact.id }] },
    },
  });

  await prisma.lead.update({
    where: { id: lead.id },
    data: { status: "QUALIFIED", convertedOpportunityId: opportunity.id },
  });

  return NextResponse.json({
    accountId: account.id,
    contactId: contact.id,
    opportunityId: opportunity.id,
  });
}

const VALID_TYPES = ["PLACEPULSE", "PLYMIO", "AI_NAVIGATOR", "ADVISORY", "OTHER"];
const TYPE_LABELS: Record<string, string> = {
  PLACEPULSE: "PlacePulse",
  PLYMIO: "Plymio",
  AI_NAVIGATOR: "AI Navigator",
  ADVISORY: "ArqOne Advisory",
  OTHER: "New Opportunity",
};

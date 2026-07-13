import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isProductKey, productLabel } from "@/lib/products";
import { getPipelineForProduct } from "@/lib/catalog";

type SecondaryRequest = {
  product: string;
  name?: string;
  value?: number;
};

/**
 * Converts a lead into Account + Contact + Opportunity on the lead's PRIMARY
 * product pipeline. Optional `secondaries` create separate opportunities per
 * additional product — one product per opportunity, never combined. Nothing
 * is created silently: the caller (the conversion review screen) states
 * exactly what to create.
 *
 * Body (all optional):
 * {
 *   name?: string,            // opportunity name override
 *   value?: number,           // opportunity value (defaults to estimatedValue)
 *   ownerId?: string,         // owner override (defaults to lead owner)
 *   secondaries?: [{ product, name?, value? }]
 * }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await req.json().catch(() => ({}));

  const lead = await prisma.lead.findUnique({ where: { id: params.id } });
  if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (lead.convertedOpportunityId) {
    return NextResponse.json(
      { error: "Lead already converted", opportunityId: lead.convertedOpportunityId },
      { status: 409 }
    );
  }
  if (lead.primaryProduct === "UNASSIGNED") {
    return NextResponse.json(
      { error: "Assign a primary product before converting this lead" },
      { status: 400 }
    );
  }

  const companyName = lead.company?.trim() || lead.name;

  // 1. Preserve or create the shared account (never duplicated per product).
  let account = await prisma.account.findFirst({ where: { name: companyName } });
  if (!account) {
    account = await prisma.account.create({
      data: {
        name: companyName,
        country: lead.markets.split(",")[0]?.trim() || "AE",
        industry: lead.sector || null,
        description: lead.notes || null,
        ownerId: lead.ownerId,
      },
    });
  }

  // 2. Preserve or create the contact (matched by email when available).
  const parts = lead.name.trim().split(/\s+/);
  const firstName = parts[0];
  const lastName = parts.slice(1).join(" ") || "-";

  let contact =
    lead.email != null
      ? await prisma.contact.findUnique({ where: { email: lead.email } })
      : null;
  if (!contact) {
    contact = await prisma.contact.create({
      data: {
        firstName,
        lastName,
        email: lead.email || null,
        phone: lead.phone || null,
        title: lead.title || null,
        accountId: account.id,
      },
    });
  }

  const ownerId = (body.ownerId as string | undefined) ?? lead.ownerId;
  const carryNotes =
    [
      lead.notes ? `From lead: ${lead.notes}` : "",
      lead.source ? `Source: ${lead.source}` : "",
      lead.salesMotion ? `Sales motion: ${lead.salesMotion}` : "",
      lead.tags ? `Tags: ${lead.tags}` : "",
    ]
      .filter(Boolean)
      .join("\n") || null;

  const leadRec = lead; // non-null capture for the closure below

  async function createOpportunity(product: string, name: string, value: number | null) {
    const pipeline = await getPipelineForProduct(product);
    const initialStage = pipeline.stages.find((s) => s.active && !s.isWon && !s.isLost)!;
    return prisma.opportunity.create({
      data: {
        name,
        product,
        pipelineId: pipeline.id,
        stageId: initialStage.id,
        stage: initialStage.key,
        probability: initialStage.defaultProbability,
        value,
        markets: leadRec.markets,
        ownerId,
        accountId: account!.id,
        nextAction: leadRec.nextAction,
        nextActionDate: leadRec.nextActionDate,
        notes: carryNotes,
        contacts: { create: [{ contactId: contact!.id }] },
      },
      include: { stageRef: true, pipeline: { select: { id: true, name: true } } },
    });
  }

  // 3. Primary opportunity on the lead's primary product pipeline.
  const primaryName =
    (body.name as string | undefined)?.trim() ||
    `${productLabel(lead.primaryProduct)} — ${companyName}`;
  const primaryValue =
    body.value !== undefined ? Number(body.value) || null : lead.estimatedValue;

  const primary = await createOpportunity(lead.primaryProduct, primaryName, primaryValue);

  // 4. Optional, explicitly requested secondary-product opportunities.
  const secondaries: SecondaryRequest[] = Array.isArray(body.secondaries) ? body.secondaries : [];
  const allowed = new Set(
    (lead.secondaryProducts ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
  const created: { id: string; product: string }[] = [];
  for (const s of secondaries) {
    if (!isProductKey(s.product) || s.product === lead.primaryProduct) continue;
    if (!allowed.has(s.product)) continue; // only products the lead actually flagged
    const name = s.name?.trim() || `${productLabel(s.product)} — ${companyName}`;
    const opp = await createOpportunity(s.product, name, s.value != null ? Number(s.value) || null : null);
    created.push({ id: opp.id, product: s.product });
  }

  await prisma.lead.update({
    where: { id: lead.id },
    data: { status: "QUALIFIED", convertedOpportunityId: primary.id },
  });

  return NextResponse.json({
    accountId: account.id,
    contactId: contact.id,
    opportunityId: primary.id,
    pipelineId: primary.pipeline?.id,
    stage: primary.stage,
    secondaryOpportunities: created,
  });
}

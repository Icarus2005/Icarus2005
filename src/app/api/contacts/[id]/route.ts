import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ACQUISITION_PATHS, CONTACT_ROLES, LEAD_SOURCE_TYPES, RELATIONSHIP_STRENGTHS } from "@/lib/constants";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const contact = await prisma.contact.findUnique({
    where: { id: id },
    include: {
      account: true,
      opportunities: { include: { opportunity: true } },
      activities: { orderBy: { date: "desc" }, take: 20 },
    },
  });
  if (!contact) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(contact);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const allowed = [
    "firstName", "lastName", "accountId", "title", "role", "email", "phone", "linkedin",
    "relationshipStrength", "sourceType", "sourceDetail", "acquisitionPath", "referredById",
  ] as const;
  const data = Object.fromEntries(allowed.filter((field) => body[field] !== undefined).map((field) => [field, body[field]]));

  const validValue = (value: unknown, values: Record<string, string>) => value == null || (typeof value === "string" && value in values);
  if (!validValue(data.role, CONTACT_ROLES)) return NextResponse.json({ error: "Invalid buying role" }, { status: 400 });
  if (!validValue(data.relationshipStrength, RELATIONSHIP_STRENGTHS)) return NextResponse.json({ error: "Invalid relationship strength" }, { status: 400 });
  if (!validValue(data.sourceType, LEAD_SOURCE_TYPES)) return NextResponse.json({ error: "Invalid source type" }, { status: 400 });
  if (!validValue(data.acquisitionPath, ACQUISITION_PATHS)) return NextResponse.json({ error: "Invalid acquisition path" }, { status: 400 });
  if (data.referredById === id) return NextResponse.json({ error: "A Contact cannot refer themselves" }, { status: 400 });

  try {
    const contact = await prisma.contact.update({ where: { id }, data });
    return NextResponse.json(contact);
  } catch {
    return NextResponse.json({ error: "Could not update Contact" }, { status: 400 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.contact.delete({ where: { id: id } });
  return new NextResponse(null, { status: 204 });
}

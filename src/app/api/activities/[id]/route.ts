import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isValidActivityType } from "@/lib/activityValidation";

// Editing an Activity's own fields never touches Lead.status or
// Opportunity.stage — those are separate concepts (relationship maturity /
// deal maturity vs. what already happened) and this handler has no code
// path that writes to either.
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await req.json();
  if (body.type !== undefined && !isValidActivityType(body.type)) {
    return NextResponse.json({ error: `Invalid activity type: ${body.type}` }, { status: 400 });
  }
  if (body.date) body.date = new Date(body.date);
  const activity = await prisma.activity.update({
    where: { id: params.id },
    data: body,
  });
  return NextResponse.json(activity);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  await prisma.activity.delete({ where: { id: params.id } });
  return new NextResponse(null, { status: 204 });
}

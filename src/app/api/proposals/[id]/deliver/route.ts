import { NextRequest, NextResponse } from "next/server";
import { deliverProposal } from "@/lib/proposals/pipeline";

/** Phase 4 — creates/links the CRM Opportunity. Approved proposals only. */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await req.json().catch(() => ({}));
  try {
    const result = await deliverProposal(params.id, body.ownerId);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Delivery failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

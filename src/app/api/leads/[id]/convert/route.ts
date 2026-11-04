import { NextRequest, NextResponse } from "next/server";
import { convertLeadToOpportunity, LeadConversionError } from "@/lib/leadConversion";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await req.json().catch(() => ({}));
    const result = await convertLeadToOpportunity(id, body);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof LeadConversionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Lead conversion failed", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "Lead conversion failed; no records were changed" }, { status: 500 });
  }
}

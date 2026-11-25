import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { inquirySourceKey, parseInvestorInquiry, verifyInvestorWebhook } from "@/lib/fundraising/inboundAuth";

export const dynamic = "force-dynamic";
const MAX_BYTES = 8192;
const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Server-to-server investor inquiry intake for two public /invest pages.
 * Deliberately disabled until the receiving CRM and originating websites share
 * a privately configured HMAC secret and their consent/rate limits are reviewed.
 * There are no public reads, automatic sends, contacts, commitments or tasks.
 */
export async function POST(request: NextRequest) {
  if (process.env.CRM_INBOUND_INVESTOR_ENABLED !== "true" ||
      !process.env.CRM_INBOUND_INVESTOR_HMAC_SECRET ||
      process.env.CRM_INBOUND_INVESTOR_HMAC_SECRET.length < 32) {
    return NextResponse.json({ error: "Investor inquiry integration unavailable." }, { status: 503, headers: NO_STORE });
  }

  if (Number(request.headers.get("content-length") || "0") > MAX_BYTES) {
    return NextResponse.json({ error: "Request too large." }, { status: 413, headers: NO_STORE });
  }
  let raw = "";
  const reader = request.body?.getReader();
  if (!reader) return NextResponse.json({ error: "Request body required." }, { status: 400, headers: NO_STORE });
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      bytes += value.byteLength;
      if (bytes > MAX_BYTES) {
        await reader.cancel().catch(() => {});
        return NextResponse.json({ error: "Request too large." }, { status: 413, headers: NO_STORE });
      }
      raw += Buffer.from(value).toString("utf8");
    }
  } catch {
    return NextResponse.json({ error: "Invalid body." }, { status: 400, headers: NO_STORE });
  }

  if (!verifyInvestorWebhook({
    secret: process.env.CRM_INBOUND_INVESTOR_HMAC_SECRET,
    timestamp: request.headers.get("x-arqone-timestamp"),
    signature: request.headers.get("x-arqone-signature"),
    rawBody: raw,
  })) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401, headers: NO_STORE });
  }

  try {
    const input = parseInvestorInquiry(JSON.parse(raw));
    const sourceKey = inquirySourceKey(input);
    const now = new Date().toISOString();
    // This is an unverified inbound contact request, not a send, reply, payment,
    // confirmed investment, or verified investor identity.
    await prisma.fundraisingProspect.createMany({
      data: [{
        roundKey: input.roundKey,
        sourceKey,
        name: `${input.fullName} · ${input.organization}`,
        routeType: "Inbound investor inquiry",
        priority: "Qualify",
        status: "NEEDS_QUALIFICATION",
        nextAction: "Review investor request, verify organization and contact details, then respond personally.",
        notes: [
          `Contact name: ${input.fullName}`,
          `Organization: ${input.organization}`,
          `Unverified work email: ${input.email}`,
          `Investor's opt-in message: ${input.message}`,
          `Contact consent version: ${input.consentVersion}`,
          "No outbound message has been sent.",
        ].join("\n"),
        evidence: `Opt-in website form submission received ${now}; source: ${input.sourcePage}; event: ${input.eventId}`,
        source: "Direct investor inquiry",
        sourceStatus: "Unverified inbound form submission",
        drafts: [],
      }],
      skipDuplicates: true,
    });
    return NextResponse.json({ accepted: true }, { status: 202, headers: NO_STORE });
  } catch (error) {
    if (error instanceof SyntaxError || (error instanceof Error && (error.message.startsWith("Invalid") || error.message.includes("consent")))) {
      return NextResponse.json({ error: "Invalid investor inquiry." }, { status: 400, headers: NO_STORE });
    }
    // Never expose DB errors, contact data or inbound messages to public callers.
    return NextResponse.json({ error: "Investor inquiry could not be recorded." }, { status: 503, headers: NO_STORE });
  }
}

export async function GET() {
  return NextResponse.json({ error: "Method not allowed." }, { status: 405, headers: NO_STORE });
}

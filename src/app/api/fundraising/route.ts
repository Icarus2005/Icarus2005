import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getEmailProvider } from "@/lib/email/zoho";
import { FundraisingError, importProspects, logEvent, reconcileDelivery, sendFundraisingEmail, updateProspect } from "@/lib/fundraising/service";
import { FUNDRAISING_ROUNDS, ROUND_KEY, ROUND_KEYS, parseRoundKey } from "@/lib/fundraising/rules";

export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  let roundKey: ReturnType<typeof parseRoundKey>;
  try { roundKey = parseRoundKey(req.nextUrl.searchParams.get("roundKey") || ROUND_KEY); }
  catch { return NextResponse.json({ error: "Unknown fundraising round." }, { status: 400 }); }
  try {
    const prospects = await prisma.fundraisingProspect.findMany({ where: { roundKey }, orderBy: { sourceKey: "asc" }, include: {
      contact: { select: { id: true, firstName: true, lastName: true, email: true } },
      tasks: { where: { status: "OPEN" }, orderBy: { dueDate: "asc" } },
      activities: { orderBy: { date: "desc" }, take: 20 },
      dispatches: { where: { state: { in: ["SENDING", "UNCERTAIN"] } }, select: { id: true, state: true, createdAt: true } },
    } });
    // Flag cross-venture duplicate outreach before an operator approves a new email.
    // Server-side send validation independently enforces this boundary.
    const otherSent = await prisma.fundraisingProspect.findMany({
      where: { roundKey: { in: ROUND_KEYS.filter(key => key !== roundKey) }, firstSentAt: { not: null }, contactId: { not: null } },
      select: { contact: { select: { email: true } } },
    });
    const crossVentureContactEmails = [...new Set(otherSent.flatMap(p => p.contact?.email ? [p.contact.email.toLowerCase()] : []))];
    return NextResponse.json({
      prospects, roundKey,
      targetUsd: FUNDRAISING_ROUNDS[roundKey].targetUsd,
      briefingUrl: FUNDRAISING_ROUNDS[roundKey].briefingUrl,
      crossVentureContactEmails,
      zohoConfigured: !!getEmailProvider(),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "Fundraising unavailable. Confirm its database migration has been applied." }, { status: 503 }); }
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    // Bound upload size before parsing; import limit also applies to row count.
    const raw = await req.text();
    if (raw.length > 2_000_000) return NextResponse.json({ error: "Import exceeds 2 MB." }, { status: 413 });
    body = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
  } catch { return NextResponse.json({ error: "Invalid JSON object." }, { status: 400 }); }
  try {
    if (body.action === "IMPORT_PREVIEW") return NextResponse.json({ rows: await importProspects(body.rows, true, parseRoundKey(body.roundKey ?? ROUND_KEY)) });
    if (body.action === "IMPORT") {
      if (body.reviewed !== true) throw new FundraisingError("Review the import preview first.");
      return NextResponse.json(await importProspects(body.rows, false, parseRoundKey(body.roundKey ?? ROUND_KEY)));
    }
    if (typeof body.id !== "string") throw new FundraisingError("Route ID is required.");
    if (body.action === "SAVE") return NextResponse.json(await updateProspect(body.id, body));
    if (body.action === "SEND") return NextResponse.json(await sendFundraisingEmail(body.id, body, getEmailProvider()));
    if (body.action === "RECONCILE") return NextResponse.json(await reconcileDelivery(body.id, body));
    return NextResponse.json(await logEvent(body.id, body));
  } catch (error) {
    if (error instanceof FundraisingError) return NextResponse.json({ error: error.message }, { status: error.status });
    // Validation errors are ordinary Errors; never expose raw DB messages or payloads.
    const message = error instanceof Error && !error.constructor.name.startsWith("Prisma") ? error.message : "The operation could not be recorded. Refresh and review its outcome before retrying.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

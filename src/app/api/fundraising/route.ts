import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getEmailProvider } from "@/lib/email/zoho";
import { FundraisingError, importProspects, logEvent, reconcileDelivery, sendFundraisingEmail, updateProspect } from "@/lib/fundraising/service";
import { ROUND_KEY, TARGET_USD } from "@/lib/fundraising/rules";

export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const prospects = await prisma.fundraisingProspect.findMany({ where: { roundKey: ROUND_KEY }, orderBy: { sourceKey: "asc" }, include: {
      contact: { select: { id: true, firstName: true, lastName: true, email: true } },
      tasks: { where: { status: "OPEN" }, orderBy: { dueDate: "asc" } },
      activities: { orderBy: { date: "desc" }, take: 20 },
      dispatches: { where: { state: { in: ["SENDING", "UNCERTAIN"] } }, select: { id: true, state: true, createdAt: true } },
    } });
    return NextResponse.json({ prospects, targetUsd: TARGET_USD, zohoConfigured: !!getEmailProvider() }, { headers: { "Cache-Control": "no-store" } });
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
    if (body.action === "IMPORT_PREVIEW") return NextResponse.json({ rows: await importProspects(body.rows, true) });
    if (body.action === "IMPORT") {
      if (body.reviewed !== true) throw new FundraisingError("Review the import preview first.");
      return NextResponse.json(await importProspects(body.rows, false));
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

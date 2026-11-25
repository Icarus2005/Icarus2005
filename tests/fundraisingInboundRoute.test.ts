import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { prisma } from "../src/lib/prisma";
import { POST, GET } from "../src/app/api/fundraising/inbound/route";
import { inquirySourceKey, parseInvestorInquiry } from "../src/lib/fundraising/inboundAuth";

const url = process.env.DATABASE_URL;
const safeDb = !!url && /^(localhost|127\.0\.0\.1)$/.test(new URL(url).hostname) && new URL(url).pathname.includes("disposable");
const BRAND_SECRET = "synthetic-brand-investor-secret-only-123456";
const PLACE_SECRET = "synthetic-place-investor-secret-only-123456";
const keys = ["CRM_INBOUND_INVESTOR_ENABLED", "CRM_INBOUND_INVESTOR_BRANDSPRK_SECRET", "CRM_INBOUND_INVESTOR_PLACEPULSE_SECRET"] as const;
function signed(body: Record<string, unknown>, secret: string, round = String(body.roundKey), timestamp = String(Math.floor(Date.now() / 1000))) {
  const raw = JSON.stringify(body);
  return new NextRequest("https://example.test/api/fundraising/inbound", {
    method: "POST",
    body: raw,
    headers: {
      "content-type": "application/json",
      "x-arqone-round": round,
      "x-arqone-timestamp": timestamp,
      "x-arqone-signature": createHmac("sha256", secret).update(timestamp + ".").update(raw).digest("hex"),
    },
  });
}

test("actual signed intake persists once in the correct round and cannot send outreach", { skip: !safeDb }, async () => {
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const base = {
    eventId: randomUUID(), roundKey: "brandsprk-preseed-2026",
    fullName: "Synthetic Investor", organization: "Synthetic Fund", email: "test@example.test",
    message: "Résumé — request an overview.", sourcePage: "https://www.brandsprk.io/invest",
    consent: true, consentVersion: "2026-11-v1",
  };
  const place = { ...base, roundKey: "placepulse-preseed-2026", sourcePage: "https://www.placepulse.io/invest" };
  const sourceKeys = [inquirySourceKey(parseInvestorInquiry(base)), inquirySourceKey(parseInvestorInquiry(place))];
  try {
    process.env.CRM_INBOUND_INVESTOR_ENABLED = "false";
    process.env.CRM_INBOUND_INVESTOR_BRANDSPRK_SECRET = BRAND_SECRET;
    process.env.CRM_INBOUND_INVESTOR_PLACEPULSE_SECRET = PLACE_SECRET;
    assert.equal((await POST(signed(base, BRAND_SECRET))).status, 503);
    assert.equal((await GET()).status, 405);
    process.env.CRM_INBOUND_INVESTOR_ENABLED = "true";
    assert.equal((await POST(signed(base, PLACE_SECRET))).status, 401);
    assert.equal((await POST(signed(base, BRAND_SECRET, String(base.roundKey), String(Math.floor(Date.now()/1000)-301)))).status, 401);
    assert.equal((await POST(signed({ ...base, consent: false }, BRAND_SECRET))).status, 400);
    assert.equal((await POST(signed(place, BRAND_SECRET, base.roundKey))).status, 400);
    assert.equal(await prisma.fundraisingProspect.count({ where: { sourceKey: { in: sourceKeys } } }), 0);
    assert.equal((await POST(signed(base, BRAND_SECRET))).status, 202);
    assert.equal((await POST(signed(base, BRAND_SECRET))).status, 202);
    assert.equal((await POST(signed(place, PLACE_SECRET))).status, 202);
    const rows = await prisma.fundraisingProspect.findMany({ where: { sourceKey: { in: sourceKeys } }, include: { tasks: true, activities: true, dispatches: true } });
    assert.equal(rows.length, 2);
    assert.deepEqual(new Set(rows.map(row => row.roundKey)), new Set([base.roundKey, place.roundKey]));
    for (const row of rows) {
      assert.equal(row.status, "NEEDS_QUALIFICATION");
      assert.equal(row.contactId, null);
      assert.equal(row.firstSentAt, null);
      assert.equal(Number(row.committedUsd), 0);
      assert.equal(Number(row.receivedUsd), 0);
      assert.equal(row.tasks.length + row.activities.length + row.dispatches.length, 0);
      assert.match(row.notes, /Résumé — request an overview/);
    }
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
    await prisma.fundraisingProspect.deleteMany({ where: { sourceKey: { in: sourceKeys } } });
    await prisma.$disconnect();
  }
});

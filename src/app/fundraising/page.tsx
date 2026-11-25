"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Draft, ImportRow, PRIORITIES, ROUND_KEY, ROUND_KEYS, FUNDRAISING_ROUNDS, RoundKey, SEND_KINDS, STATUSES } from "@/lib/fundraising/rules";

import { betaIntroduction, defaultOutreachStep, newZohoSendBlock } from "@/lib/fundraising/outreachFocus";

type Prospect = ImportRow & {
  id: string; roundKey: RoundKey; updatedAt: string; contactId: string | null; contact: { id: string; firstName: string; lastName: string; email: string | null } | null;
  committedUsd: string; receivedUsd: string; capitalEvidence: string; firstSentAt: string | null; lastSentAt: string | null;
  tasks: { id: string; title: string; dueDate: string | null }[];
  activities: { id: string; subject: string; notes: string | null; date: string; type: string }[];
  dispatches: { id: string; state: string; createdAt: string }[];
};
const usd = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
const date = (v: string | null) => v ? new Date(v).toLocaleString("en-GB", { timeZone: "Asia/Dubai", dateStyle: "medium", timeStyle: "short" }) : "Not recorded";
const dubaiDay = (v: string | Date) => new Date(new Date(v).getTime() + 4 * 3600000).toISOString().slice(0,10);
const inputClass = "w-full rounded border border-gray-300 bg-white p-2 text-sm";
const buttonClass = "rounded bg-brand-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-40";
async function api(body: Record<string, unknown>) {
  const response = await fetch("/api/fundraising", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Operation failed.");
  return data;
}

export default function FundraisingPage() {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [roundKey, setRoundKey] = useState<RoundKey>(ROUND_KEY);
  const [crossVentureContactEmails, setCrossVentureContactEmails] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [configured, setConfigured] = useState(false);
  const target = FUNDRAISING_ROUNDS[roundKey].targetUsd;
  const activeRound = useRef<RoundKey>(ROUND_KEY);
  const requestVersion = useRef(0);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [priority, setPriority] = useState("");
  const [queueOnly, setQueueOnly] = useState(true);
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [preview, setPreview] = useState<(ImportRow & { operation: string })[] | null>(null);
  const [busy, setBusy] = useState(false);
  const reload = useCallback(async () => {
    if (activeRound.current !== roundKey) return;
    const version = ++requestVersion.current;
    const response = await fetch(`/api/fundraising?roundKey=${encodeURIComponent(roundKey)}`, { cache: "no-store" });
    const data = await response.json();
    if (activeRound.current !== roundKey || requestVersion.current !== version) return;
    if (!response.ok) throw new Error(data.error);
    if (data.roundKey !== roundKey) throw new Error("Unexpected fundraising round.");
    setProspects(data.prospects); setConfigured(data.zohoConfigured);
    setCrossVentureContactEmails(data.crossVentureContactEmails ?? []);
  }, [roundKey]);
  useEffect(() => { reload().catch(e => setError(e.message)); }, [reload]);
   const todayDubai = dubaiDay(new Date());
  const openFollowups = (p: Prospect) => p.tasks.filter(t => t.id === `fundraise_${p.id}_1` || t.id === `fundraise_${p.id}_2`);
  const due = (p: Prospect) => openFollowups(p).some(t => t.dueDate && dubaiDay(t.dueDate) <= todayDubai);
  const actionable = (p: Prospect) => p.priority !== "Hold" && !["PAUSED", "REJECTED", "HOLD", "COMMITTED"].includes(p.status) && (due(p) || ["NOT_STARTED", "SUBMITTED_PREVIOUSLY", "NEEDS_QUALIFICATION"].includes(p.status));
  // Put overdue follow-ups first, followed by the active Now/Qualify queue.
  // Sorting changes presentation only; it never changes saved investor priorities or statuses.
  const list = prospects.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) && (!priority || p.priority === priority) && (!queueOnly || actionable(p)))
    .sort((a, b) => {
      const overdueDifference = Number(due(b)) - Number(due(a));
      if (overdueDifference) return overdueDifference;
      const priorityDifference = PRIORITIES.indexOf(a.priority as typeof PRIORITIES[number]) - PRIORITIES.indexOf(b.priority as typeof PRIORITIES[number]);
      if (priorityDifference) return priorityDifference;
      return a.name.localeCompare(b.name);
    });
  const p = list.find(route => route.id === selected) ?? list[0];
  const nextRoute = p && list.length > 1 ? list[(list.findIndex(route => route.id === p.id) + 1) % list.length] : undefined;
  const overdueCount = prospects.filter(due).length;
  const activeCount = prospects.filter(p => p.priority !== "Hold" && !["PAUSED", "REJECTED", "HOLD", "COMMITTED"].includes(p.status)).length;
  // Route-based funnel: these counts are not unique investor counts or proven conversion rates.
  // Never infer an outreach send from SUBMITTED_PREVIOUSLY without a confirmed send timestamp.
  const confirmedOutreachCount = prospects.filter(p => Boolean(p.firstSentAt)).length;
  const conversationCount = prospects.filter(p => ["REPLIED", "MEETING", "DILIGENCE", "COMMITTED"].includes(p.status)).length;
  const meetingCount = prospects.filter(p => ["MEETING", "DILIGENCE", "COMMITTED"].includes(p.status)).length;
  const diligenceCount = prospects.filter(p => ["DILIGENCE", "COMMITTED"].includes(p.status)).length;
  const committedCount = prospects.filter(p => p.status === "COMMITTED").length;
  const submittedPreviouslyCount = prospects.filter(p => p.status === "SUBMITTED_PREVIOUSLY" && !p.firstSentAt).length;
  const commitments = prospects.reduce((n, p) => n + Number(p.committedUsd), 0);
  const received = prospects.reduce((n, p) => n + Number(p.receivedUsd), 0);
  const committedPercent = target > 0 ? Math.min(100, Math.max(0, commitments / target * 100)) : 0;
  const receivedPercent = target > 0 ? Math.min(100, Math.max(0, received / target * 100)) : 0;
  const funnelStages = [
    ["Routes tracked", prospects.length],
    ["Confirmed outreach", confirmedOutreachCount],
    ["Conversation / reply stage", conversationCount],
    ["Meeting or later", meetingCount],
    ["Diligence or later", diligenceCount],
    ["Committed status", committedCount],
  ] as const;
  async function loadImport(file: File) {
    setBusy(true); setError(""); setPreview(null); setRows(null);
    try {
      if (file.size > 2_000_000) throw new Error("Import exceeds 2 MB.");
      const input = JSON.parse(await file.text());
      // Existing private BrandSprk imports have no round marker. New PlacePulse
      // imports must explicitly declare their destination to avoid misfiling.
      if (roundKey !== ROUND_KEY && input.roundKey !== roundKey) {
        throw new Error("PlacePulse imports require roundKey: placepulse-preseed-2026 in the JSON file.");
      }
      if (input.roundKey && input.roundKey !== roundKey) throw new Error("Import belongs to a different fundraising venture.");
      const result = await api({ action: "IMPORT_PREVIEW", roundKey, rows: input.rows ?? input });
      setRows(result.rows.map(({ operation: _operation, ...row }: ImportRow & { operation: string }) => row));
      setPreview(result.rows);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function commitImport() {
    setBusy(true); setError("");
    try { await api({ action: "IMPORT", roundKey, rows, reviewed: true }); setPreview(null); setRows(null); await reload(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <div className="space-y-5 p-4 md:p-8">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="text-2xl font-semibold">Investor fundraising</h1><p className="text-sm text-gray-600">Separate pre-seed pipelines. Beta-stage ventures; no investment results inferred.</p></div>
      <Link className="text-sm text-brand-700 underline" href={`/tasks?product=${FUNDRAISING_ROUNDS[roundKey].product}`}>Shared CRM tasks</Link>
    </div>
    <div className="flex flex-wrap gap-2" role="group" aria-label="Choose venture fundraising round">
      {ROUND_KEYS.map(key => <button key={key} type="button" aria-pressed={roundKey === key} disabled={busy} className={`rounded-lg border px-4 py-2 text-sm font-medium ${roundKey === key ? "border-brand-700 bg-brand-700 text-white" : "bg-white text-gray-700"}`} onClick={() => {
        if (roundKey === key) return;
        activeRound.current = key; requestVersion.current++;
        setSelected(null); setProspects([]); setConfigured(false); setCrossVentureContactEmails([]); setPreview(null); setRows(null); setError(""); setNotice(""); setRoundKey(key);
      }}>{FUNDRAISING_ROUNDS[key].label} · {usd(FUNDRAISING_ROUNDS[key].targetUsd)}</button>)}
    </div>
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
      <p className="text-gray-600">{FUNDRAISING_ROUNDS[roundKey].description}. Fundraising target; valuation terms are subject to agreement.</p>
      <a className="text-brand-700 underline" target="_blank" rel="noopener noreferrer" href={FUNDRAISING_ROUNDS[roundKey].briefingUrl}>Open {FUNDRAISING_ROUNDS[roundKey].label} investor briefing</a>
    </div>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {[["Round target", usd(target)], ["Confirmed commitments", usd(prospects.reduce((n,p) => n + Number(p.committedUsd), 0))], ["Cash received", usd(prospects.reduce((n,p) => n + Number(p.receivedUsd), 0))], ["Actions to review", String(prospects.filter(actionable).length)]].map(([label,value]) => <div key={label} className="rounded-lg border bg-white p-4"><p className="text-xs text-gray-500">{label}</p><p className="text-xl font-semibold">{value}</p></div>)}
    </div>
    <p className="text-xs text-gray-600">Capital totals are separate from commercial revenue. Tasks appear automatically after a confirmed send. No emails are sent automatically. Dates are Dubai time.</p>
    <details className="rounded-lg border bg-white p-4">
      <summary className="cursor-pointer font-medium">Fundraising evidence and capital progress</summary>
      <p className="mt-1 text-xs text-gray-600">Route-based operational indicators, not unique-investor conversion rates. Stages reflect saved CRM status. Historic submissions are not counted as confirmed sends.</p>
      <div className="mt-4 grid gap-5 lg:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-medium">Investor engagement stages</h3>
          <dl className="space-y-2 text-sm">
            {funnelStages.map(([label, count]) => <div key={label} className="flex items-center justify-between gap-3"><dt className="text-gray-600">{label}</dt><dd className="font-semibold tabular-nums">{count}</dd></div>)}
          </dl>
          {submittedPreviouslyCount > 0 && <p className="mt-3 text-xs text-gray-600">{submittedPreviouslyCount} historical submission route(s) await verification; not counted as new outreach.</p>}
        </div>
        <div>
          <h3 className="mb-2 text-sm font-medium">Capital against round target</h3>
          <div className="space-y-4">
            <div><div className="mb-1 flex justify-between gap-2 text-sm"><span>Confirmed commitments</span><span className="tabular-nums">{usd(commitments)} / {usd(target)}</span></div><div role="progressbar" aria-label="Confirmed commitments progress" aria-valuenow={Math.round(committedPercent)} aria-valuemin={0} aria-valuemax={100} className="h-2 overflow-hidden rounded-full bg-gray-100"><div className="h-full bg-brand-700" style={{ width: `${committedPercent}%` }} /></div></div>
            <div><div className="mb-1 flex justify-between gap-2 text-sm"><span>Cash received</span><span className="tabular-nums">{usd(received)} / {usd(target)}</span></div><div role="progressbar" aria-label="Received cash progress" aria-valuenow={Math.round(receivedPercent)} aria-valuemin={0} aria-valuemax={100} className="h-2 overflow-hidden rounded-full bg-gray-100"><div className="h-full bg-gray-700" style={{ width: `${receivedPercent}%` }} /></div></div>
          </div>
          <p className="mt-3 text-xs text-gray-600">Only evidence-backed confirmed commitments and received funds are included. These are not subscription revenue.</p>
        </div>
      </div>
    </details>
    {notice && <p role="status" className="rounded border border-green-200 bg-green-50 p-3 text-sm text-green-800">{notice}</p>}
    {error && <p role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    <details className="rounded-lg border bg-white p-4" open={!prospects.length}>
      <summary className="cursor-pointer font-medium">Import private funding tracker</summary>
      <p className="my-2 text-sm text-gray-600">Importing into <strong>{FUNDRAISING_ROUNDS[roundKey].label}</strong> only. Verify every route belongs to this venture before import. PlacePulse JSON must declare its roundKey. Existing source IDs are skipped; imports never create sends, commitments or follow-ups.</p>
      <label className="text-sm">JSON import file<input aria-label="JSON import file" type="file" accept=".json,application/json" disabled={busy} onChange={e => { const f = e.target.files?.[0]; if (f) void loadImport(f); e.target.value = ""; }} className="mt-2 block" /></label>
      {preview && <div className="mt-3 space-y-3"><div className="max-h-80 overflow-auto"><table className="w-full text-left text-sm"><thead><tr><th>ID</th><th>Route</th><th>Status</th><th>Drafts</th><th>Result</th></tr></thead><tbody>{preview.map(r => <tr key={r.sourceKey} className="border-t"><td>{r.sourceKey}</td><td>{r.name}</td><td>{r.status}</td><td>{r.drafts.length}</td><td>{r.operation}</td></tr>)}</tbody></table></div><button className={buttonClass} disabled={busy} onClick={commitImport}>Import reviewed routes</button></div>}
    </details>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-lg font-semibold">Investor outreach</h2><p className="text-xs text-gray-600">Review the message, send or record it, then move to the next investor.</p></div>
      <span className="text-sm text-gray-600">{prospects.filter(actionable).length} actions to review</span>
    </div>
    <div className="flex flex-wrap items-center gap-3">
      <input aria-label="Search routes" placeholder="Search routes" className={`${inputClass} max-w-xs`} value={search} onChange={e => setSearch(e.target.value)} />
      <select aria-label="Filter priority" className={`${inputClass} max-w-40`} value={priority} onChange={e => setPriority(e.target.value)}><option value="">All priorities</option>{PRIORITIES.map(s => <option key={s}>{s}</option>)}</select>
      <label className="text-sm"><input type="checkbox" checked={queueOnly} onChange={e => setQueueOnly(e.target.checked)} /> Daily action queue</label>
      <button className="text-sm text-brand-700 underline" onClick={() => reload().catch(e => setError(e.message))}>Refresh</button>
      <p className="text-xs text-gray-600" role="status">{list.length} shown · {activeCount} active · {overdueCount} overdue</p>
    </div>
    <div className="grid items-start gap-5 xl:grid-cols-[330px_1fr]">
      <div className="space-y-2">{list.length ? list.map(p => <button key={p.id} onClick={() => setSelected(p.id)} className={`w-full rounded-lg border p-3 text-left ${((selected && list.some(route => route.id === selected)) ? selected === p.id : list[0]?.id === p.id) ? "border-brand-600 bg-brand-50" : "bg-white"}`}><p className="font-medium">{p.name}</p><p className="text-xs text-gray-600">{p.priority} · {p.routeType} · {p.status.replaceAll("_", " ")}</p><p className="mt-1 line-clamp-2 text-sm">{p.nextAction}</p>{due(p) && <p className="mt-1 text-xs font-semibold text-red-700">Overdue follow-up</p>}{openFollowups(p)[0] && <p className={`mt-1 text-xs ${due(p) ? "text-red-700" : "text-gray-500"}`}>Next follow-up: {date(openFollowups(p)[0].dueDate)}</p>}</button>) : <p className="text-sm text-gray-500">No routes in this view.</p>}</div>
      {p ? <ProspectDetail key={`${p.id}-${p.updatedAt}`} prospect={p} configured={configured} reload={reload} onNotice={setNotice} nextInvestor={nextRoute ? () => setSelected(nextRoute.id) : undefined} briefingUrl={FUNDRAISING_ROUNDS[roundKey].briefingUrl} crossVentureContacted={!!p.contact?.email && crossVentureContactEmails.includes(p.contact.email.toLowerCase())} /> : <div className="rounded-lg border bg-white p-8 text-gray-500">Select a route to review the relationship, drafts and next action.</div>}
    </div>
  </div>;
}

function ProspectDetail({ prospect: p, configured, reload, briefingUrl, crossVentureContacted, onNotice, nextInvestor }: { prospect: Prospect; configured: boolean; reload: () => Promise<void>; briefingUrl: string; crossVentureContacted: boolean; onNotice: (text: string) => void; nextInvestor?: () => void }) {
  const [form, setForm] = useState(p);
  const [draftIndex, setDraftIndex] = useState(0);
  const [subject, setSubject] = useState(p.drafts[0]?.subject ?? `${FUNDRAISING_ROUNDS[p.roundKey].label} pre-seed`);
  const [body, setBody] = useState(p.drafts[0]?.body ?? "");
  const [kind, setKind] = useState<string>(defaultOutreachStep(p));
  const [channel, setChannel] = useState("EMAIL");
  const [conditions, setConditions] = useState(false);
  const [approved, setApproved] = useState(false);
  const [sentConfirmed, setSentConfirmed] = useState(false);
  const [at, setAt] = useState(() => new Date(Date.now() + 4 * 3600000).toISOString().slice(0,16));
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [contacts, setContacts] = useState<{id:string;firstName:string;lastName:string;email:string|null}[]>([]);
  const [contactSearch, setContactSearch] = useState("");
  const [eventNote, setEventNote] = useState("");
  const [reconcileNote, setReconcileNote] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  useEffect(() => {
    if (contactSearch.trim().length < 2) { setContacts([]); return; }
    const abort = new AbortController();
    const timeout = setTimeout(() => fetch(`/api/contacts?search=${encodeURIComponent(contactSearch)}`, { signal: abort.signal }).then(r => r.ok ? r.json() : Promise.reject(new Error("Contact search failed."))).then(data => setContacts(Array.isArray(data) ? data.slice(0,30) : data.contacts?.slice(0,30) ?? [])).catch(e => { if (e.name !== "AbortError") setMessage(e.message); }), 250);
    return () => { clearTimeout(timeout); abort.abort(); };
  }, [contactSearch]);
  function resetApproval() { setConditions(false); setApproved(false); setSentConfirmed(false); }
  const change = (field: keyof Prospect, value: unknown) => { setForm(f => ({ ...f, [field]: value })); resetApproval(); };
  function selectDraft(index: number) { setDraftIndex(index); setSubject(form.drafts[index].subject); setBody(form.drafts[index].body); resetApproval(); setKey(crypto.randomUUID()); }
  async function run(action: string, extra: Record<string,unknown> = {}) {
    setBusy(true); setMessage("");
    try {
      await api({ ...extra, action, id: p.id });
      const result = action === "SAVE" ? "Changes saved" : action === "SEND" ? "Send confirmed" : "Event recorded";
      setMessage(result + ".");
      onNotice(`${p.name}: ${result}.`);
      setKey(crypto.randomUUID()); resetApproval(); await reload();
    }
    catch (e) { setMessage((e as Error).message); if (action === "SEND") await reload().catch(() => {}); }
    finally { setBusy(false); }
  }
  function save() {
    const drafts: Draft[] = form.drafts.length ? form.drafts.map((d,i) => i === draftIndex ? { ...d, subject, body } : d) : [{ id: "MANUAL", subject, body, channel, condition: "Review before sending." }];
    void run("SAVE", { ...form, drafts, committedUsd: Number(form.committedUsd), receivedUsd: Number(form.receivedUsd) });
  }
  const eventAt = () => new Date(`${at}:00+04:00`).toISOString();
  const condition = form.drafts[draftIndex]?.condition || "Check the relationship and message before sending.";
  const routeChangesPending = form.contactId !== p.contactId || form.status !== p.status || form.priority !== p.priority;
  const sendBlock = newZohoSendBlock(p, { configured, recipient: p.contact?.email, crossVentureContacted, kind, condition, routeChangesPending });
  const completeDraft = !!subject.trim() && !!body.trim();
  const dirty = JSON.stringify(form) !== JSON.stringify(p) || subject !== (p.drafts[draftIndex]?.subject ?? `${FUNDRAISING_ROUNDS[p.roundKey].label} pre-seed`) || body !== (p.drafts[draftIndex]?.body ?? "");
  const manualBlocked = busy || !!p.dispatches.length || routeChangesPending || !completeDraft;
  function copyLinkedIn() {
    void navigator.clipboard.writeText(body).then(() => {
      setChannel("LINKEDIN"); setManualOpen(true); resetApproval();
      setMessage("Message copied. Send it on LinkedIn, then record the actual send below.");
    }).catch(() => setMessage("Clipboard unavailable. Select and copy the message."));
  }
  function useBetaDraft() {
    if (dirty && !window.confirm("Replace the current unsaved subject and message?")) return;
    const draft = betaIntroduction(p.roundKey);
    setSubject(draft.subject); setBody(draft.body); resetApproval();
  }
  return <div className="space-y-5 rounded-lg border bg-white p-4 md:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-xl font-semibold">{p.name}</h2>
        <p className="mt-1 text-sm text-gray-600">{FUNDRAISING_ROUNDS[p.roundKey].label} · {p.priority} · {p.status.replaceAll("_", " ")}</p>
      </div>
      {nextInvestor && <button type="button" className="rounded border px-3 py-2 text-sm font-medium" disabled={busy} onClick={() => { if (!dirty || window.confirm("Skip this investor without saving unsaved edits?")) nextInvestor(); }}>Skip / next investor</button>}
    </div>
    {message && <p role="status" className="rounded bg-gray-100 p-3 text-sm">{message}</p>}
    <div className="rounded-lg border border-brand-100 bg-brand-50 p-3">
      <p className="text-xs font-medium text-brand-700">Recommended next action (saved CRM record)</p>
      <p className="mt-1 text-sm">{p.nextAction}</p>
      {(p.status === "SUBMITTED_PREVIOUSLY" || p.sourceStatus === "Submitted previously") && <p className="mt-2 text-xs text-gray-600">Historical submission only; no confirmed outreach timestamp. Keep that history, and verify the recipient or original thread before contacting.</p>}
    </div>
    {p.dispatches.length > 0 && <div className="space-y-3 rounded border border-amber-300 bg-amber-50 p-3"><h3 className="font-medium">Unresolved delivery</h3><p className="text-sm">Check Zoho Sent. Do not retry the message. After ten minutes, record the verified outcome and evidence.</p><textarea aria-label="Delivery verification evidence" className={inputClass} value={reconcileNote} onChange={e => setReconcileNote(e.target.value)} />{p.dispatches.map(d => <div key={d.id} className="space-x-3 text-sm"><p>{d.state} · {date(d.createdAt)}</p>{["SENT","NOT_SENT"].map(outcome => <button key={outcome} className="my-2 rounded border bg-white px-3 py-2" disabled={busy || !reconcileNote.trim()} onClick={() => run("RECONCILE", { dispatchId:d.id, outcome, evidence:reconcileNote, at:eventAt() })}>Verified {outcome.replaceAll("_"," ").toLowerCase()}</button>)}</div>)}</div>}
    <div className="border-t pt-4"><h3 className="font-medium">Review outreach message</h3>
      {form.drafts.length > 0 && <select aria-label="Choose draft" className={`${inputClass} my-2`} value={draftIndex} onChange={e => selectDraft(Number(e.target.value))}>{form.drafts.map((d,i) => <option key={d.id} value={i}>{d.id} · {d.channel} · {d.subject}</option>)}</select>}
      <p className="mb-2 text-sm text-amber-800">Sending condition: {condition}</p>
      <label className="block text-sm">Subject<input className={inputClass} value={subject} onChange={e => {setSubject(e.target.value);resetApproval();}} /></label>
      <label className="mt-2 block text-sm">Message<textarea className={inputClass} rows={9} value={body} onChange={e => {setBody(e.target.value);resetApproval();}} /></label>
      <p className="text-xs text-gray-500">{body.length} characters. For LinkedIn, use the limit shown in your connection box.</p>
      <div className="mt-3 flex flex-wrap gap-3">
        <button type="button" className="rounded border px-3 py-2 text-sm" disabled={busy} onClick={useBetaDraft}>Use beta introduction</button>
        <button type="button" className="rounded border border-brand-600 px-3 py-2 text-sm text-brand-700" onClick={() => { if (!body.includes(briefingUrl)) setBody(text => `${text.trim()}\n\nInvestor briefing: ${briefingUrl}`); resetApproval(); }}>Insert correct investor briefing</button>
        <button className={buttonClass} disabled={busy || !subject.trim() || !body.trim()} onClick={save}>Save route and draft</button><button type="button" className="rounded border px-3 py-2 text-sm font-medium" disabled={busy || !completeDraft} onClick={copyLinkedIn}>Copy for LinkedIn</button></div>
    </div>
    <div className="space-y-3 border-t pt-4">
      <h3 className="font-medium">Send or record outreach</h3>
      <p className="text-sm">Zoho recipient: {p.contact?.email || "No verified contact linked"}</p>
      <select aria-label="Send sequence step" className={inputClass} value={kind} onChange={e => {setKind(e.target.value);resetApproval();}}>{SEND_KINDS.map(s => <option key={s}>{s}</option>)}</select>
      <label className="block text-sm"><input type="checkbox" checked={conditions} onChange={e => {setConditions(e.target.checked);setApproved(false);setSentConfirmed(false);}} /> I checked the recipient, sending condition and existing conversation.</label>
      {sendBlock ? <p className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{sendBlock}</p> : <>
        <label className="block text-sm"><input type="checkbox" checked={approved} onChange={e => setApproved(e.target.checked)} /> I approve this exact recipient, subject and message for sending now.</label>
        <button className={buttonClass} disabled={busy || !approved || !conditions || !completeDraft} onClick={() => run("SEND", { key, kind, subject, body, to: p.contact?.email, approved, conditionsConfirmed: conditions })}>{busy ? "Working…" : "Approve and send via Zoho"}</button>
      </>}
      <details className="rounded border p-3" open={manualOpen} onToggle={e => setManualOpen(e.currentTarget.open)}>
        <summary className="cursor-pointer font-medium text-sm">Record a message sent outside CRM</summary>
        <div className="mt-3 space-y-3">
          <p className="text-xs text-gray-600">Only record after actually sending. Confirm the text and actual event time. This never sends another message.</p>
          <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Actual event time (Dubai)<input className={inputClass} type="datetime-local" value={at} onChange={e => {setAt(e.target.value);setSentConfirmed(false);}} /></label><label className="text-sm">Channel<select className={inputClass} value={channel} onChange={e => {setChannel(e.target.value);setSentConfirmed(false);}}>{["EMAIL","LINKEDIN","WHATSAPP","CALL","MEETING","NOTE"].map(s => <option key={s}>{s}</option>)}</select></label></div>
          <label className="block text-sm"><input type="checkbox" checked={sentConfirmed} onChange={e => setSentConfirmed(e.target.checked)} /> I confirm this exact message has already been sent outside this screen.</label>
          <button className={buttonClass} disabled={manualBlocked || !sentConfirmed || !conditions || !at} onClick={() => run("LOG_SENT", { key, kind, subject, body, channel, at: eventAt(), confirmed: sentConfirmed })}>Record confirmed send</button>
        </div>
      </details>
    </div>
    <details className="rounded border p-3" open={advancedOpen} onToggle={e => setAdvancedOpen(e.currentTarget.open)}>
      <summary className="cursor-pointer font-medium text-sm">Relationship, contact and capital details</summary>
      <div className="mt-4 space-y-4">
    <p className="text-xs text-gray-500">Source: {p.source} · {p.sourceStatus}. Original evidence: {p.evidence}</p>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm">Status<select className={inputClass} value={form.status} onChange={e => change("status",e.target.value)}>{STATUSES.map(s => <option key={s} value={s} disabled={s === "CONTACTED" && p.status !== "CONTACTED"}>{s.replaceAll("_"," ")}</option>)}</select></label>
      <label className="text-sm">Priority<select className={inputClass} value={form.priority} onChange={e => change("priority",e.target.value)}>{PRIORITIES.map(s => <option key={s}>{s}</option>)}</select></label>
    </div>
    <label className="block text-sm">Next action<textarea className={inputClass} value={form.nextAction} onChange={e => change("nextAction",e.target.value)} /></label>
    <label className="block text-sm">Relationship notes<textarea className={inputClass} rows={3} value={form.notes} onChange={e => change("notes",e.target.value)} /></label>
    <div className="space-y-2"><label className="block text-sm">Find an existing CRM contact<input className={inputClass} placeholder="Search name or email (2+ characters)" value={contactSearch} onChange={e => setContactSearch(e.target.value)} /></label>
      <select aria-label="Link CRM contact" className={inputClass} value={form.contactId ?? ""} onChange={e => change("contactId",e.target.value || null)}><option value="">Unlinked; no email sending</option>{p.contact && <option value={p.contact.id}>{p.contact.firstName} {p.contact.lastName} · {p.contact.email || "No email"}</option>}{contacts.filter(c => c.id !== p.contact?.id).map(c => <option key={c.id} value={c.id}>{c.firstName} {c.lastName} · {c.email || "No email"}</option>)}</select>
      <p className="text-xs text-gray-500">Save the contact link before sending. <Link href="/contacts/new" className="underline">Create a contact</Link> if none exists.</p>
    </div>
    <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Confirmed commitments (USD)<input className={inputClass} type="number" min="0" step="0.01" value={form.committedUsd} onChange={e => change("committedUsd",e.target.value)} /></label><label className="text-sm">Cash received (USD)<input className={inputClass} type="number" min="0" step="0.01" value={form.receivedUsd} onChange={e => change("receivedUsd",e.target.value)} /></label></div>
    <label className="block text-sm">Capital confirmation evidence<textarea className={inputClass} placeholder="Dated confirmation / signed documents / receipt reference" value={form.capitalEvidence} onChange={e => change("capitalEvidence",e.target.value)} /></label>

        <button className={buttonClass} disabled={busy || !completeDraft} onClick={save}>Save relationship and draft</button>
        {!completeDraft && <p className="text-xs text-gray-600">Enter a subject and message before saving this route.</p>}
      </div>
    </details>
    <details className="rounded border p-3">
      <summary className="cursor-pointer font-medium text-sm">Replies, rejection and pause</summary>
      <div className="mt-3 space-y-3">
        <p className="text-xs text-gray-500">First sent: {date(p.firstSentAt)}. Last sent: {date(p.lastSentAt)}. Uses the actual event time and channel in the recording panel above.</p>
        <label className="block text-sm">Reply / rejection / pause evidence<textarea className={inputClass} value={eventNote} onChange={e => setEventNote(e.target.value)} placeholder="What happened and why?" /></label>
        <div className="flex flex-wrap gap-3">{[["REPLY","Record reply"],["REJECT","Record rejection"],["PAUSE","Pause outreach"]].map(([action,label]) => <button key={action} className="rounded border px-3 py-2 text-sm disabled:opacity-40" disabled={busy || !eventNote.trim() || !at} onClick={() => run(action, { key: crypto.randomUUID(), subject: `${label}: ${p.name}`, body: eventNote, channel, at: eventAt() })}>{label}</button>)}</div>
      </div>
    </details>
    <div className="border-t pt-4"><h3 className="font-medium">Open follow-up tasks</h3>{p.tasks.length ? p.tasks.map(t => <p key={t.id} className="mt-2 text-sm">{t.title} · {date(t.dueDate)}</p>) : <p className="text-sm text-gray-500">No open follow-ups.</p>}</div>
    <details className="rounded border p-3"><summary className="cursor-pointer font-medium text-sm">Recent CRM activities ({p.activities.length})</summary>{p.activities.map(a => <div key={a.id} className="mt-3 border-t pt-2 text-sm"><p>{a.subject} · {a.type} · {date(a.date)}</p><p className="mt-1 whitespace-pre-wrap text-gray-600">{a.notes}</p></div>)}</details>
  </div>;
}

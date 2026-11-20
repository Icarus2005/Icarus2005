"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Draft, ImportRow, PRIORITIES, SEND_KINDS, STATUSES } from "@/lib/fundraising/rules";

type Prospect = ImportRow & {
  id: string; contactId: string | null; contact: { id: string; firstName: string; lastName: string; email: string | null } | null;
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
  const [selected, setSelected] = useState<string | null>(null);
  const [configured, setConfigured] = useState(false);
  const [target, setTarget] = useState(300000);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [priority, setPriority] = useState("");
  const [queueOnly, setQueueOnly] = useState(false);
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [preview, setPreview] = useState<(ImportRow & { operation: string })[] | null>(null);
  const [busy, setBusy] = useState(false);
  const reload = useCallback(async () => {
    const response = await fetch("/api/fundraising", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    setProspects(data.prospects); setConfigured(data.zohoConfigured); setTarget(data.targetUsd);
  }, []);
  useEffect(() => { reload().catch(e => setError(e.message)); }, [reload]);
  const p = prospects.find(p => p.id === selected);
  const todayDubai = dubaiDay(new Date());
  const due = (p: Prospect) => p.tasks.some(t => t.dueDate && dubaiDay(t.dueDate) <= todayDubai);
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
  const overdueCount = prospects.filter(due).length;
  const activeCount = prospects.filter(p => p.priority !== "Hold" && !["PAUSED", "REJECTED", "HOLD", "COMMITTED"].includes(p.status)).length;
  async function loadImport(file: File) {
    setBusy(true); setError(""); setPreview(null); setRows(null);
    try {
      if (file.size > 2_000_000) throw new Error("Import exceeds 2 MB.");
      const input = JSON.parse(await file.text());
      const result = await api({ action: "IMPORT_PREVIEW", rows: input.rows ?? input });
      setRows(result.rows.map(({ operation: _operation, ...row }: ImportRow & { operation: string }) => row));
      setPreview(result.rows);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function commitImport() {
    setBusy(true); setError("");
    try { await api({ action: "IMPORT", rows, reviewed: true }); setPreview(null); setRows(null); await reload(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <div className="space-y-5 p-4 md:p-8">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="text-2xl font-semibold">BrandSprk fundraising</h1><p className="text-sm text-gray-600">Pre-seed. Cap open for discussion. Pre-revenue / early validation.</p></div>
      <Link className="text-sm text-brand-700 underline" href="/tasks?product=BRANDSPRK">Shared CRM tasks</Link>
    </div>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {[["Round target", usd(target)], ["Confirmed commitments", usd(prospects.reduce((n,p) => n + Number(p.committedUsd), 0))], ["Cash received", usd(prospects.reduce((n,p) => n + Number(p.receivedUsd), 0))], ["Actions to review", String(prospects.filter(actionable).length)]].map(([label,value]) => <div key={label} className="rounded-lg border bg-white p-4"><p className="text-xs text-gray-500">{label}</p><p className="text-xl font-semibold">{value}</p></div>)}
    </div>
    <p className="text-xs text-gray-600">Capital totals are separate from commercial revenue. Tasks appear automatically after a confirmed send. No emails are sent automatically. Dates are Dubai time.</p>
    {error && <p role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    <details className="rounded-lg border bg-white p-4" open={!prospects.length}>
      <summary className="cursor-pointer font-medium">Import private funding tracker</summary>
      <p className="my-2 text-sm text-gray-600">Choose the prepared JSON import. Review all routes below, then import. Existing source IDs are skipped. Imports create no sends, commitments or follow-up tasks.</p>
      <label className="text-sm">JSON import file<input aria-label="JSON import file" type="file" accept=".json,application/json" disabled={busy} onChange={e => { const f = e.target.files?.[0]; if (f) void loadImport(f); e.target.value = ""; }} className="mt-2 block" /></label>
      {preview && <div className="mt-3 space-y-3"><div className="max-h-80 overflow-auto"><table className="w-full text-left text-sm"><thead><tr><th>ID</th><th>Route</th><th>Status</th><th>Drafts</th><th>Result</th></tr></thead><tbody>{preview.map(r => <tr key={r.sourceKey} className="border-t"><td>{r.sourceKey}</td><td>{r.name}</td><td>{r.status}</td><td>{r.drafts.length}</td><td>{r.operation}</td></tr>)}</tbody></table></div><button className={buttonClass} disabled={busy} onClick={commitImport}>Import reviewed routes</button></div>}
    </details>
    <div className="flex flex-wrap items-center gap-3">
      <input aria-label="Search routes" placeholder="Search routes" className={`${inputClass} max-w-xs`} value={search} onChange={e => setSearch(e.target.value)} />
      <select aria-label="Filter priority" className={`${inputClass} max-w-40`} value={priority} onChange={e => setPriority(e.target.value)}><option value="">All priorities</option>{PRIORITIES.map(s => <option key={s}>{s}</option>)}</select>
      <label className="text-sm"><input type="checkbox" checked={queueOnly} onChange={e => setQueueOnly(e.target.checked)} /> Daily action queue</label>
      <button className="text-sm text-brand-700 underline" onClick={() => reload().catch(e => setError(e.message))}>Refresh</button>
      <p className="text-xs text-gray-600" role="status">{list.length} shown · {activeCount} active · {overdueCount} overdue</p>
    </div>
    <div className="grid items-start gap-5 xl:grid-cols-[330px_1fr]">
      <div className="space-y-2">{list.length ? list.map(p => <button key={p.id} onClick={() => setSelected(p.id)} className={`w-full rounded-lg border p-3 text-left ${selected === p.id ? "border-brand-600 bg-brand-50" : "bg-white"}`}><p className="font-medium">{p.name}</p><p className="text-xs text-gray-600">{p.priority} · {p.routeType} · {p.status.replaceAll("_", " ")}</p><p className="mt-1 line-clamp-2 text-sm">{p.nextAction}</p>{due(p) && <p className="mt-1 text-xs font-semibold text-red-700">Overdue follow-up</p>}{p.tasks[0] && <p className={`mt-1 text-xs ${due(p) ? "text-red-700" : "text-gray-500"}`}>Next follow-up: {date(p.tasks[0].dueDate)}</p>}</button>) : <p className="text-sm text-gray-500">No routes in this view.</p>}</div>
      {p ? <ProspectDetail key={`${p.id}-${p.activities[0]?.id ?? "new"}`} prospect={p} configured={configured} reload={reload} /> : <div className="rounded-lg border bg-white p-8 text-gray-500">Select a route to review the relationship, drafts and next action.</div>}
    </div>
  </div>;
}

function ProspectDetail({ prospect: p, configured, reload }: { prospect: Prospect; configured: boolean; reload: () => Promise<void> }) {
  const [form, setForm] = useState(p);
  const [draftIndex, setDraftIndex] = useState(0);
  const [subject, setSubject] = useState(p.drafts[0]?.subject ?? "BrandSprk pre-seed");
  const [body, setBody] = useState(p.drafts[0]?.body ?? "");
  const [kind, setKind] = useState(p.firstSentAt ? "FOLLOWUP_1" : "INITIAL");
  const [channel, setChannel] = useState("EMAIL");
  const [conditions, setConditions] = useState(false);
  const [approved, setApproved] = useState(false);
  const [sentConfirmed, setSentConfirmed] = useState(false);
  const [at, setAt] = useState(new Date().toISOString().slice(0,16));
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [contacts, setContacts] = useState<{id:string;firstName:string;lastName:string;email:string|null}[]>([]);
  const [contactSearch, setContactSearch] = useState("");
  const [eventNote, setEventNote] = useState("");
  const [reconcileNote, setReconcileNote] = useState("");
  useEffect(() => {
    if (contactSearch.trim().length < 2) { setContacts([]); return; }
    const abort = new AbortController();
    const timeout = setTimeout(() => fetch(`/api/contacts?search=${encodeURIComponent(contactSearch)}`, { signal: abort.signal }).then(r => r.ok ? r.json() : Promise.reject(new Error("Contact search failed."))).then(data => setContacts(Array.isArray(data) ? data.slice(0,30) : data.contacts?.slice(0,30) ?? [])).catch(e => { if (e.name !== "AbortError") setMessage(e.message); }), 250);
    return () => { clearTimeout(timeout); abort.abort(); };
  }, [contactSearch]);
  const change = (field: keyof Prospect, value: unknown) => setForm(f => ({ ...f, [field]: value }));
  function selectDraft(index: number) { setDraftIndex(index); setSubject(form.drafts[index].subject); setBody(form.drafts[index].body); setConditions(false); setApproved(false); setKey(crypto.randomUUID()); }
  async function run(action: string, extra: Record<string,unknown> = {}) {
    setBusy(true); setMessage("");
    try { await api({ ...extra, action, id: p.id }); setMessage("Recorded successfully."); setKey(crypto.randomUUID()); setApproved(false); setSentConfirmed(false); await reload(); }
    catch (e) { setMessage((e as Error).message); if (action === "SEND") await reload().catch(() => {}); }
    finally { setBusy(false); }
  }
  function save() {
    const drafts: Draft[] = form.drafts.length ? form.drafts.map((d,i) => i === draftIndex ? { ...d, subject, body } : d) : [{ id: "MANUAL", subject, body, channel, condition: "Review before sending." }];
    void run("SAVE", { ...form, drafts, committedUsd: Number(form.committedUsd), receivedUsd: Number(form.receivedUsd) });
  }
  const eventAt = () => new Date(`${at}:00Z`).toISOString();
  return <div className="space-y-5 rounded-lg border bg-white p-4 md:p-6">
    <h2 className="text-xl font-semibold">{p.name}</h2>
    {message && <p role="status" className="rounded bg-gray-100 p-3 text-sm">{message}</p>}
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
    <div className="border-t pt-4"><h3 className="font-medium">Review outreach draft</h3>
      {form.drafts.length > 0 && <select aria-label="Choose draft" className={`${inputClass} my-2`} value={draftIndex} onChange={e => selectDraft(Number(e.target.value))}>{form.drafts.map((d,i) => <option key={d.id} value={i}>{d.id} · {d.channel} · {d.subject}</option>)}</select>}
      <p className="mb-2 text-sm text-amber-800">Sending condition: {form.drafts[draftIndex]?.condition || "Check the relationship and message before sending."}</p>
      <label className="block text-sm">Subject<input className={inputClass} value={subject} onChange={e => {setSubject(e.target.value);setApproved(false);}} /></label>
      <label className="mt-2 block text-sm">Message<textarea className={inputClass} rows={8} value={body} onChange={e => {setBody(e.target.value);setApproved(false);}} /></label>
      <p className="text-xs text-gray-500">{body.length} characters. For LinkedIn, use the limit shown in your connection box.</p>
      <div className="mt-3 flex flex-wrap gap-3"><button className={buttonClass} disabled={busy || !subject.trim() || !body.trim()} onClick={save}>Save route and draft</button><button className="text-sm underline" onClick={() => navigator.clipboard.writeText(body).then(() => setMessage("Draft copied.")).catch(() => setMessage("Clipboard unavailable. Select and copy the message."))}>Copy message</button></div>
    </div>
    <div className="space-y-3 border-t pt-4"><h3 className="font-medium">Send or record an actual event</h3>
      <p className="text-xs text-gray-500">First sent: {date(p.firstSentAt)}. Last sent: {date(p.lastSentAt)}. Imported historical submissions have no invented send date.</p>
      <select aria-label="Send sequence step" className={inputClass} value={kind} onChange={e => {setKind(e.target.value);setApproved(false);}}>{SEND_KINDS.map(s => <option key={s}>{s}</option>)}</select>
      <label className="block text-sm"><input type="checkbox" checked={conditions} onChange={e => setConditions(e.target.checked)} /> I checked the sending condition and existing thread.</label>
      <p className="text-sm">Zoho recipient: {p.contact?.email || "Link a verified CRM contact first"}</p>
      <p className="text-xs text-gray-500">Existing-thread replies must be sent in Zoho, then recorded below. This screen sends a new email without attachments.</p>
      <label className="block text-sm"><input type="checkbox" checked={approved} onChange={e => setApproved(e.target.checked)} /> I approve this exact recipient, subject and message for sending now.</label>
      <button className={buttonClass} disabled={busy || !configured || !p.contact?.email || !approved || !conditions || p.dispatches.length > 0 || !!form.drafts[draftIndex]?.condition.toLowerCase().includes("original acknowledgement thread") || kind !== "INITIAL"} onClick={() => run("SEND", { key, kind, subject, body, to: p.contact?.email, approved, conditionsConfirmed: conditions })}>{busy ? "Working…" : "Approve and send via Zoho"}</button>
      {!configured && <p className="text-xs text-gray-500">Zoho sending is not configured.</p>}
      <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Actual event time (UTC)<input className={inputClass} type="datetime-local" value={at} onChange={e => setAt(e.target.value)} /></label><label className="text-sm">Channel<select className={inputClass} value={channel} onChange={e => setChannel(e.target.value)}>{["EMAIL","LINKEDIN","WHATSAPP","CALL","MEETING","NOTE"].map(s => <option key={s}>{s}</option>)}</select></label></div>
      <label className="block text-sm"><input type="checkbox" checked={sentConfirmed} onChange={e => setSentConfirmed(e.target.checked)} /> I confirm this message was already sent outside this screen.</label>
      <button className={buttonClass} disabled={busy || !sentConfirmed || !conditions} onClick={() => run("LOG_SENT", { key, kind, subject, body, channel, at: eventAt(), confirmed: sentConfirmed })}>Record confirmed send</button>
      <label className="block text-sm">Reply / rejection / pause evidence<textarea className={inputClass} value={eventNote} onChange={e => setEventNote(e.target.value)} placeholder="What happened and why?" /></label>
      <div className="flex flex-wrap gap-3">{[["REPLY","Record reply"],["REJECT","Record rejection"],["PAUSE","Pause outreach"]].map(([action,label]) => <button key={action} className="rounded border px-3 py-2 text-sm disabled:opacity-40" disabled={busy || !eventNote.trim()} onClick={() => run(action, { key: crypto.randomUUID(), subject: `${label}: ${p.name}`, body: eventNote, channel, at: eventAt() })}>{label}</button>)}</div>
    </div>
    {p.dispatches.length > 0 && <div className="space-y-3 rounded border border-amber-300 bg-amber-50 p-3"><h3 className="font-medium">Unresolved delivery</h3><p className="text-sm">Check Zoho Sent. Do not retry the message. After ten minutes, record the verified outcome and evidence.</p><textarea aria-label="Delivery verification evidence" className={inputClass} value={reconcileNote} onChange={e => setReconcileNote(e.target.value)} />{p.dispatches.map(d => <div key={d.id} className="space-x-3 text-sm"><p>{d.state} · {date(d.createdAt)}</p>{["SENT","NOT_SENT"].map(outcome => <button key={outcome} className="my-2 rounded border bg-white px-3 py-2" disabled={busy || !reconcileNote.trim()} onClick={() => run("RECONCILE", { dispatchId:d.id, outcome, evidence:reconcileNote, at:eventAt() })}>Verified {outcome.replaceAll("_"," ").toLowerCase()}</button>)}</div>)}</div>}
    <div className="border-t pt-4"><h3 className="font-medium">Open follow-up tasks</h3>{p.tasks.length ? p.tasks.map(t => <p key={t.id} className="mt-2 text-sm">{t.title} · {date(t.dueDate)}</p>) : <p className="text-sm text-gray-500">No open follow-ups.</p>}</div>
    <div className="border-t pt-4"><h3 className="font-medium">Recent CRM activities</h3>{p.activities.map(a => <div key={a.id} className="mt-3 border-t pt-2 text-sm"><p>{a.subject} · {a.type} · {date(a.date)}</p><p className="mt-1 whitespace-pre-wrap text-gray-600">{a.notes}</p></div>)}</div>
  </div>;
}

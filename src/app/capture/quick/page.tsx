"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, Mic, RotateCcw } from "lucide-react";
import { BUSINESS_LINES, PRODUCTS_META } from "@/lib/products";
import { type QuickSuggestion } from "@/lib/capture/quick";

type Match = { id: string; name: string; company: string; accountId: string; reason: string };
type AccountMatch = { id: string; name: string };
type Saved = { activityId: string; taskId: string | null; contactId: string | null; leadId: string | null; accountId: string | null };
type TeamMember = { id: string; name: string; active: boolean };
type Review = {
  personName: string; companyName: string; statedRole: string; productKey: string;
  conversationSummary: string; relationshipContext: string; theirCommitment: string;
  myCommitment: string; nextAction: string; dueDate: string; notes: string;
  email: string; phone: string; contactId: string; accountId: string;
};

const EMPTY_REVIEW: Review = {
  personName: "", companyName: "", statedRole: "", productKey: "", conversationSummary: "",
  relationshipContext: "", theirCommitment: "", myCommitment: "", nextAction: "", dueDate: "",
  notes: "", email: "", phone: "", contactId: "", accountId: "",
};
const STORAGE_KEY = "arqone-crm.quickCaptureDraft.v1";
const CONTEXT_STORAGE_KEY = "arqone-crm.quickCaptureContext.v1";

function editableLabel(label: string, state: "EXTRACTED" | "AI_INTERPRETATION" | "USER_STATED") {
  return <span className="flex items-center justify-between gap-2 text-sm font-medium text-gray-800">{label}<span className="text-[10px] font-semibold text-gray-500">{state.replace("_", " ")}</span></span>;
}

export default function QuickCapturePage() {
  const [stage, setStage] = useState<"capture" | "review" | "saved">("capture");
  const [transcript, setTranscript] = useState("");
  const [review, setReview] = useState<Review>(EMPTY_REVIEW);
  const [eventName, setEventName] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [location, setLocation] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [ownerLoadError, setOwnerLoadError] = useState(false);
  const [matches, setMatches] = useState<Match[]>([]);
  const [accounts, setAccounts] = useState<AccountMatch[]>([]);
  const [matchPending, setMatchPending] = useState(false);
  const [matchError, setMatchError] = useState(false);
  const [matchRefresh, setMatchRefresh] = useState(0);
  const [matchDecision, setMatchDecision] = useState<"unreviewed" | "new" | "existing">("unreviewed");
  const [optionalReviewed, setOptionalReviewed] = useState(false);
  const [suggestion, setSuggestion] = useState<QuickSuggestion | null>(null);
  const [key, setKey] = useState("");
  const [saved, setSaved] = useState<Saved | null>(null);
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [listening, setListening] = useState(false);
  const [speechAvailable, setSpeechAvailable] = useState(false);
  const [message, setMessage] = useState("");
  const [saveError, setSaveError] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const recognitionRef = useRef<{ start: () => void; stop: () => void } | null>(null);
  const speechBase = useRef("");
  const captureVersion = useRef(0);
  const matchVersion = useRef(0);

  useEffect(() => {
    const savedDraft = localStorage.getItem(STORAGE_KEY);
    let legacyContext: Record<string, unknown> = {};
    if (savedDraft) {
      try {
        const draft = JSON.parse(savedDraft);
        setTranscript(typeof draft.transcript === "string" ? draft.transcript : "");
        setReview({ ...EMPTY_REVIEW, ...(draft.review ?? {}) });
        setSuggestion(draft.suggestion ?? null);
        setStage(draft.stage === "review" ? "review" : "capture");
        legacyContext = draft;
        setMatchDecision(draft.matchDecision === "new" || draft.matchDecision === "existing" ? draft.matchDecision : "unreviewed");
        setKey(draft.key || crypto.randomUUID());
      } catch { setKey(crypto.randomUUID()); }
    } else setKey(crypto.randomUUID());
    let context = legacyContext;
    try {
      const storedContext = localStorage.getItem(CONTEXT_STORAGE_KEY);
      if (storedContext) context = JSON.parse(storedContext);
    } catch { /* Retain the existing draft context when storage is malformed. */ }
    setEventName(typeof context.eventName === "string" ? context.eventName : "");
    setEventDate(typeof context.eventDate === "string" ? context.eventDate : "");
    setLocation(typeof context.location === "string" ? context.location : "");
    setOwnerId(typeof context.ownerId === "string" ? context.ownerId : localStorage.getItem("arqone-crm.currentUserId") || "");
    setSpeechAvailable(Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition));
    fetch("/api/team").then((res) => {
      if (!res.ok) throw new Error("owners unavailable");
      return res.json();
    }).then((team: TeamMember[]) => {
      const active = team.filter((member) => member.active);
      setMembers(active);
      setOwnerId((current) => {
        const selected = active.some((member) => member.id === current)
          ? current
          : active.length === 1 && active[0].name.trim().toLowerCase() === "piero saleme" ? active[0].id : "";
        if (selected) localStorage.setItem("arqone-crm.currentUserId", selected);
        return selected;
      });
    }).catch(() => setOwnerLoadError(true));
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated && stage !== "saved") localStorage.setItem(STORAGE_KEY, JSON.stringify({ stage, transcript, review, suggestion, matchDecision, key }));
  }, [hydrated, stage, transcript, review, suggestion, matchDecision, key]);

  useEffect(() => {
    if (hydrated) localStorage.setItem(CONTEXT_STORAGE_KEY, JSON.stringify({ eventName, eventDate, location, ownerId }));
  }, [hydrated, eventName, eventDate, location, ownerId]);

  const update = (field: keyof Review, value: string) => {
    setReview((current) => ({ ...current, [field]: value, ...(field === "personName" || field === "companyName" || field === "email" || field === "phone" ? { contactId: "", accountId: "" } : {}) }));
    if (["personName", "companyName", "email", "phone"].includes(field)) {
      setMatchDecision("unreviewed"); setMatches([]); setAccounts([]); setMatchPending(true);
    }
    setSaveError("");
  };

  useEffect(() => {
    if (!hydrated || stage !== "review") return;
    if (![review.personName, review.companyName, review.email, review.phone].some((value) => value.trim())) {
      setMatches([]); setAccounts([]); setMatchPending(false); setMatchError(false);
      return;
    }
    const version = ++matchVersion.current;
    const capture = captureVersion.current;
    const controller = new AbortController();
    setMatchPending(true); setMatchError(false);
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch("/api/capture/quick/matches", {
          method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
          body: JSON.stringify({ name: review.personName, company: review.companyName, email: review.email, phone: review.phone }),
        });
        if (!res.ok) throw new Error("match search failed");
        const data = await res.json();
        if (version !== matchVersion.current || capture !== captureVersion.current) return;
        setMatches(data.contacts ?? []); setAccounts(data.accounts ?? []);
      } catch {
        if (!controller.signal.aborted && version === matchVersion.current && capture === captureVersion.current) setMatchError(true);
      } finally {
        if (version === matchVersion.current && capture === captureVersion.current) setMatchPending(false);
      }
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [hydrated, stage, review.personName, review.companyName, review.email, review.phone, matchRefresh]);

  function toggleSpeech() {
    if (listening) { recognitionRef.current?.stop(); return; }
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.continuous = true;
    recognition.interimResults = false;
    speechBase.current = transcript.trim();
    const version = captureVersion.current;
    recognition.onresult = (event: any) => {
      if (version !== captureVersion.current) return;
      const spoken = Array.from(event.results as ArrayLike<any>).map((result: any) => result[0].transcript).join(" ").trim();
      setTranscript([speechBase.current, spoken].filter(Boolean).join(" "));
    };
    recognition.onerror = () => { if (version === captureVersion.current) setMessage("Dictation stopped. Your transcript is kept; use the phone keyboard if needed."); };
    recognition.onend = () => { if (version === captureVersion.current) setListening(false); };
    recognitionRef.current = recognition;
    try { recognition.start(); setListening(true); setMessage(""); }
    catch { setMessage("Speech recognition is unavailable. Use keyboard dictation or type your debrief."); }
  }

  async function processDebrief() {
    if (!transcript.trim() || processing) return;
    const version = captureVersion.current;
    recognitionRef.current?.stop();
    setProcessing(true); setMessage(""); setSaveError(""); setOptionalReviewed(false);
    try {
      const res = await fetch("/api/capture/quick/suggest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ transcript }) });
      if (!res.ok) throw new Error("suggestion failed");
      const data = await res.json();
      if (version !== captureVersion.current) return;
      const s: QuickSuggestion | null = data.suggestion;
      setSuggestion(s);
      const next = s ? {
        ...EMPTY_REVIEW, personName: s.personName || "", companyName: s.companyName || "",
        statedRole: s.statedRole || "", productKey: s.productKey || "", conversationSummary: s.conversationSummary || transcript,
        relationshipContext: s.relationshipContext || "", theirCommitment: s.theirCommitment || "",
        myCommitment: s.myCommitment || "", nextAction: s.nextAction || "", dueDate: s.dueDate || "", notes: s.notes || "",
      } : { ...EMPTY_REVIEW, conversationSummary: transcript };
      setReview(next);
      setMatches([]); setAccounts([]); setMatchPending(true);
      setMatchDecision("unreviewed");
      if (!s) setMessage("Automatic extraction is unavailable. Fill the review fields from your debrief, then save.");
      setStage("review");
    } catch {
      if (version !== captureVersion.current) return;
      setReview({ ...EMPTY_REVIEW, conversationSummary: transcript });
      setMatches([]); setAccounts([]); setMatchDecision("unreviewed");
      setStage("review");
      setMessage("Extraction failed. Your debrief is safe here; fill the review fields manually.");
    } finally { if (version === captureVersion.current) setProcessing(false); }
  }

  async function save() {
    if (saving) return;
    if (ownerLoadError) { setSaveError("Could not validate CRM owners. Reopen Quick Capture when online, then retry."); return; }
    if (!members.length) { setSaveError("No active CRM owner exists. Add an owner in Settings → Team before saving."); return; }
    if (!ownerId || !members.some((member) => member.id === ownerId)) { setSaveError("Choose an active CRM owner under Change context before saving."); return; }
    if (review.personName.trim() && !review.companyName.trim() && !review.contactId) { setSaveError("Enter a company for this person or select an existing contact."); return; }
    if (matchPending) { setSaveError("CRM match check is still running. Wait a moment, then save."); return; }
    if (matchError) { setSaveError("CRM match check failed. Retry the search before saving."); return; }
    if (matches.length && !review.contactId && matchDecision !== "new") { setSaveError("Choose the existing contact or explicitly choose to create a new contact."); return; }
    setSaving(true); setSaveError(""); setMessage("");
    try {
      const reviewedFields = optionalReviewed ? {} : { relationshipContext: "", theirCommitment: "", myCommitment: "", notes: "" };
      const res = await fetch("/api/capture/quick", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...review, ...reviewedFields, transcript, ownerId, eventName, eventDate, location, idempotencyKey: key }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSaveError(data.error || "Save failed. Your capture is preserved; retry safely.");
        if (res.status === 409) setMatchRefresh((current) => current + 1);
        return;
      }
      setSaved(data); setStage("saved"); localStorage.removeItem(STORAGE_KEY);
    } catch { setSaveError("Network error. Your reviewed capture is preserved on this phone; retry safely."); }
    finally { setSaving(false); }
  }

  function newCapture() {
    const hasUnsavedReview = stage !== "saved" && (stage === "review" || Object.values(review).some(Boolean));
    if (hasUnsavedReview && !window.confirm("Discard this reviewed capture and start a new one?")) return;
    captureVersion.current += 1;
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    speechBase.current = "";
    setListening(false);
    setTranscript(""); setReview(EMPTY_REVIEW); setMatches([]); setAccounts([]); setSuggestion(null);
    setMatchDecision("unreviewed"); setMatchError(false); setMatchPending(false); setOptionalReviewed(false);
    setKey(crypto.randomUUID()); setSaved(null); setMessage(""); setSaveError(""); setProcessing(false); setSaving(false); setStage("capture");
    localStorage.removeItem(STORAGE_KEY);
  }

  const input = (field: keyof Review, label: string, state: "EXTRACTED" | "AI_INTERPRETATION" | "USER_STATED" = "EXTRACTED", multiline = false) => (
    <label className="block space-y-1" key={field}>
      {editableLabel(label, suggestion ? state : "USER_STATED")}
      {multiline ? <textarea value={review[field]} onChange={(e) => update(field, e.target.value)} rows={2} title={suggestion?.evidenceByField[field] || undefined} className="input text-base w-full" /> : <input type={field === "email" ? "email" : field === "phone" ? "tel" : "text"} value={review[field]} onChange={(e) => update(field, e.target.value)} title={suggestion?.evidenceByField[field] || undefined} className="input py-2 text-base w-full" />}
    </label>
  );

  const ownerName = members.find((member) => member.id === ownerId)?.name || "Owner needed";
  const contextSummary = [eventName || "No event", location || "Location not set", ownerName].join(" · ");
  const exactMatch = matches.some((match) => match.reason === "name + company" || match.reason === "email" || match.reason === "phone");

  return <div className={`max-w-lg mx-auto p-4 space-y-4 ${stage === "review" ? "pb-32" : "pb-28"}`}>
    <div className="flex items-start justify-between gap-3"><div><Link href="/" className="text-sm text-gray-500">← CRM</Link><h1 className="text-2xl font-bold mt-1">Quick Capture</h1><p className="text-sm text-gray-600">Post-conversation debrief</p></div>{stage === "capture" && <button type="button" onClick={newCapture} disabled={!hydrated || saving} className="btn-secondary min-h-11 px-3 shrink-0 disabled:opacity-50">New capture</button>}</div>
    {message && <div role="alert" className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900">{message}</div>}

    {stage !== "saved" && <div className="rounded-xl border bg-white px-4 py-3 text-sm text-gray-700">
      <p><span className="font-semibold">Context:</span> {contextSummary}</p>
      <details className="mt-1"><summary className="cursor-pointer text-brand-700 font-medium">Change context</summary>
        <div className="grid grid-cols-2 gap-3 pt-3">
          <label className="col-span-2">Event (optional)<input value={eventName} onChange={(e) => { setEventName(e.target.value); setSaveError(""); }} className="input w-full mt-1" placeholder="No event" /></label>
          <label>Event date<input type="date" value={eventDate} onChange={(e) => { setEventDate(e.target.value); setSaveError(""); }} className="input w-full mt-1" /></label>
          <label>Location<input value={location} onChange={(e) => { setLocation(e.target.value); setSaveError(""); }} className="input w-full mt-1" placeholder="Optional" /></label>
          <label className="col-span-2">CRM owner<select value={ownerId} onChange={(e) => { setOwnerId(e.target.value); localStorage.setItem("arqone-crm.currentUserId", e.target.value); setSaveError(""); }} className="input w-full mt-1"><option value="">Choose owner</option>{members.map((member) => <option value={member.id} key={member.id}>{member.name}</option>)}</select></label>
        </div>
      </details>
    </div>}

    {stage === "capture" && <>
      <div className="card p-5 space-y-4">
        <p className="text-sm text-gray-700">After the conversation, speak a short debrief. You can also use your phone keyboard’s microphone.</p>
        {speechAvailable && <button type="button" onClick={toggleSpeech} className={`w-full rounded-xl py-5 text-lg font-semibold flex justify-center items-center gap-2 ${listening ? "bg-red-600 text-white" : "bg-brand-600 text-white"}`}><Mic size={22} />{listening ? "Stop dictation" : "Start dictation"}</button>}
        {listening && <p className="text-center text-red-700 text-sm font-semibold">● Listening · tap to stop</p>}
        <label className="block text-sm font-semibold">Speak or type your debrief<textarea value={transcript} onChange={(e) => setTranscript(e.target.value)} rows={7} maxLength={5000} className="input text-base w-full mt-2" placeholder="I met Ahmed from Example Group at LiveX…" /></label>
        <button onClick={processDebrief} disabled={!transcript.trim() || processing} className="btn-primary w-full justify-center py-4 text-base disabled:opacity-50">{processing ? "Processing…" : "Review capture"}</button>
      </div>
    </>}

    {stage === "review" && <>
      <div className="card p-4 space-y-3">
        <h2 className="text-lg font-bold">Review essentials</h2>
        <p className="text-xs text-gray-600">Check these suggestions, then confirm. Leave unknown fields blank.</p>
        <div className="grid grid-cols-2 gap-3">{input("personName", "Name")}{input("companyName", "Company")}</div>
        <div className="grid grid-cols-2 gap-3">
          {input("statedRole", "Role / title")}
          <label className="block space-y-1">{editableLabel("Product / venture", suggestion ? "EXTRACTED" : "USER_STATED")}<select className="input py-2 w-full text-base" value={review.productKey} onChange={(e) => update("productKey", e.target.value)}><option value="">Unknown</option>{BUSINESS_LINES.map((product) => <option key={product} value={product}>{PRODUCTS_META[product].label}</option>)}</select></label>
        </div>
        {input("conversationSummary", "Conversation summary", "EXTRACTED", true)}
        <div className="grid grid-cols-[minmax(0,1fr)_9rem] gap-3">
          {input("nextAction", "Next action")}
          <label className="block space-y-1">{editableLabel("Due date", suggestion ? "EXTRACTED" : "USER_STATED")}<input type="date" value={review.dueDate} onChange={(e) => update("dueDate", e.target.value)} className="input py-2 w-full text-base" /></label>
        </div>
      </div>
      <div className="rounded-xl border bg-white px-4 py-3 text-sm space-y-2">
        <h2 className="font-semibold">CRM match</h2>
        {matchPending && <p className="text-gray-500">Checking CRM matches…</p>}
        {matchError && <p className="text-amber-800">Match search unavailable. <button type="button" onClick={() => setMatchRefresh((current) => current + 1)} className="underline font-medium">Retry search</button> before saving.</p>}
        {matches.length ? <>
          <p className="font-medium">{exactMatch ? "Existing contact found:" : "Possible match:"} {matches.map((match) => `${match.name} · ${match.company}`).join("; ")}</p>
          <label className="block">Choose how to save<select className="input w-full mt-1 py-2" value={review.contactId || (matchDecision === "new" ? "__new__" : "")} onChange={(e) => {
            const chosen = matches.find((match) => match.id === e.target.value);
            if (chosen) { setReview((current) => ({ ...current, contactId: chosen.id, accountId: chosen.accountId, companyName: chosen.company })); setMatchDecision("existing"); }
            else { setReview((current) => ({ ...current, contactId: "", accountId: "" })); setMatchDecision(e.target.value === "__new__" ? "new" : "unreviewed"); }
            setSaveError("");
          }}><option value="">Select a contact</option>{matches.map((match) => <option value={match.id} key={match.id}>Use {match.name} · {match.company}</option>)}{!exactMatch && <option value="__new__">Create a new contact instead</option>}</select></label>
        </> : !matchPending && !matchError && <p className="text-gray-600">No confident contact match{accounts.length ? ` · existing account: ${accounts.map((account) => account.name).join(", ")}` : ""}</p>}
      </div>
      <details className="card p-4 text-sm" onToggle={(event) => { if (event.currentTarget.open) setOptionalReviewed(true); }}><summary className="cursor-pointer font-semibold">More details (optional · open to include)</summary><div className="space-y-3 pt-3">
        {input("relationshipContext", "Relationship context · interpretation", "AI_INTERPRETATION")}
        {input("theirCommitment", "Their commitment")}
        {input("myCommitment", "My commitment · verify before confirming", "AI_INTERPRETATION")}
        <div className="grid grid-cols-2 gap-3">{input("email", "Email", "USER_STATED")}{input("phone", "Phone", "USER_STATED")}</div>
        {input("notes", "Additional notes", "USER_STATED", true)}
      </div></details>
      <details className="text-sm text-gray-600"><summary className="cursor-pointer">Original debrief · source visible</summary><p className="whitespace-pre-wrap mt-2">{transcript}</p><button onClick={() => setStage("capture")} className="text-brand-700 underline mt-2">Edit debrief</button></details>
      <div className="fixed bottom-0 left-0 right-0 max-w-lg mx-auto bg-white border-t p-3 space-y-2 shadow-lg">{saveError && <p role="alert" className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-800">{saveError}</p>}<div className="flex gap-2"><button onClick={() => setStage("capture")} disabled={saving} className="btn-secondary min-h-11 px-4">Back</button><button onClick={save} disabled={saving} className="btn-primary flex-1 justify-center min-h-11 text-base disabled:opacity-50">{saving ? "Saving…" : "Confirm & Save"}</button></div></div>
    </>}

    {stage === "saved" && saved && <div className="card p-6 space-y-4 text-center"><div className="mx-auto rounded-full bg-green-100 text-green-700 w-14 h-14 flex items-center justify-center"><Check /></div><h2 className="text-xl font-bold">Saved</h2><p className="text-xs text-green-700 font-semibold">USER_CONFIRMED</p><p className="text-sm text-gray-600">{saved.contactId ? "Contact linked" : "No person invented"} · Activity saved{saved.taskId ? " · Task saved" : ""}</p><button onClick={newCapture} className="btn-primary w-full justify-center py-4 text-base"><RotateCcw size={17} /> New capture</button>{saved.contactId && <Link href={`/contacts/${saved.contactId}`} className="btn-secondary w-full justify-center py-3">Open contact</Link>}{saved.leadId && <Link href={`/leads/${saved.leadId}`} className="btn-secondary w-full justify-center py-3">Open lead</Link>}</div>}
  </div>;
}

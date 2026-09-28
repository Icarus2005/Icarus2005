"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, Mic, RotateCcw } from "lucide-react";
import { BUSINESS_LINES, PRODUCTS_META } from "@/lib/products";
import { LIVE_X_CONTEXT, type QuickSuggestion } from "@/lib/capture/quick";

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

function editableLabel(label: string, state: "EXTRACTED" | "AI_INTERPRETATION" | "USER_STATED") {
  return <span className="flex items-center justify-between gap-2 text-sm font-medium text-gray-800">{label}<span className="text-[10px] font-semibold text-gray-500">{state.replace("_", " ")}</span></span>;
}

export default function QuickCapturePage() {
  const [stage, setStage] = useState<"capture" | "review" | "saved">("capture");
  const [transcript, setTranscript] = useState("");
  const [review, setReview] = useState<Review>(EMPTY_REVIEW);
  const [eventName, setEventName] = useState<string>(LIVE_X_CONTEXT.name);
  const [eventDate, setEventDate] = useState<string>(LIVE_X_CONTEXT.date);
  const [location, setLocation] = useState<string>(LIVE_X_CONTEXT.location);
  const [ownerId, setOwnerId] = useState("");
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [accounts, setAccounts] = useState<AccountMatch[]>([]);
  const [suggestion, setSuggestion] = useState<QuickSuggestion | null>(null);
  const [key, setKey] = useState("");
  const [saved, setSaved] = useState<Saved | null>(null);
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [listening, setListening] = useState(false);
  const [speechAvailable, setSpeechAvailable] = useState(false);
  const [message, setMessage] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const recognitionRef = useRef<{ start: () => void; stop: () => void } | null>(null);
  const speechBase = useRef("");

  useEffect(() => {
    const savedDraft = localStorage.getItem(STORAGE_KEY);
    if (savedDraft) {
      try {
        const draft = JSON.parse(savedDraft);
        setTranscript(typeof draft.transcript === "string" ? draft.transcript : "");
        setReview({ ...EMPTY_REVIEW, ...(draft.review ?? {}) });
        setSuggestion(draft.suggestion ?? null);
        setStage(draft.stage === "review" ? "review" : "capture");
        setEventName(draft.eventName || LIVE_X_CONTEXT.name);
        setEventDate(draft.eventDate || LIVE_X_CONTEXT.date);
        setLocation(draft.location || LIVE_X_CONTEXT.location);
        setKey(draft.key || crypto.randomUUID());
      } catch { setKey(crypto.randomUUID()); }
    } else setKey(crypto.randomUUID());
    setOwnerId(localStorage.getItem("arqone-crm.currentUserId") || "");
    setSpeechAvailable(Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition));
    fetch("/api/team").then((res) => res.json()).then((team: TeamMember[]) => {
      const active = team.filter((member) => member.active);
      setMembers(active);
      setOwnerId((current) => active.some((member) => member.id === current) ? current : "");
    }).catch(() => setMessage("Could not load owners. Retry when online."));
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated && stage !== "saved") localStorage.setItem(STORAGE_KEY, JSON.stringify({ stage, transcript, review, suggestion, eventName, eventDate, location, key }));
  }, [hydrated, stage, transcript, review, suggestion, eventName, eventDate, location, key]);

  const update = (field: keyof Review, value: string) => {
    setReview((current) => ({ ...current, [field]: value, ...(field === "personName" || field === "companyName" || field === "email" || field === "phone" ? { contactId: "", accountId: "" } : {}) }));
  };

  function toggleSpeech() {
    if (listening) { recognitionRef.current?.stop(); return; }
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.continuous = true;
    recognition.interimResults = false;
    speechBase.current = transcript.trim();
    recognition.onresult = (event: any) => {
      const spoken = Array.from(event.results as ArrayLike<any>).map((result: any) => result[0].transcript).join(" ").trim();
      setTranscript([speechBase.current, spoken].filter(Boolean).join(" "));
    };
    recognition.onerror = () => setMessage("Dictation stopped. Your transcript is kept; use the phone keyboard if needed.");
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    try { recognition.start(); setListening(true); setMessage(""); }
    catch { setMessage("Speech recognition is unavailable. Use keyboard dictation or type your debrief."); }
  }

  async function findMatches(next: Review) {
    try {
      const res = await fetch("/api/capture/quick/matches", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: next.personName, company: next.companyName, email: next.email, phone: next.phone }) });
      if (!res.ok) return;
      const data = await res.json();
      setMatches(data.contacts ?? []);
      setAccounts(data.accounts ?? []);
    } catch { setMessage("Match search unavailable. Review carefully before saving."); }
  }

  async function processDebrief() {
    if (!transcript.trim() || processing) return;
    recognitionRef.current?.stop();
    setProcessing(true); setMessage("");
    try {
      const res = await fetch("/api/capture/quick/suggest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ transcript }) });
      if (!res.ok) throw new Error("suggestion failed");
      const data = await res.json();
      const s: QuickSuggestion | null = data.suggestion;
      setSuggestion(s);
      const next = s ? {
        ...EMPTY_REVIEW, personName: s.personName || "", companyName: s.companyName || "",
        statedRole: s.statedRole || "", productKey: s.productKey || "", conversationSummary: s.conversationSummary || transcript,
        relationshipContext: s.relationshipContext || "", theirCommitment: s.theirCommitment || "",
        myCommitment: s.myCommitment || "", nextAction: s.nextAction || "", dueDate: s.dueDate || "", notes: s.notes || "",
      } : { ...EMPTY_REVIEW, conversationSummary: transcript };
      setReview(next);
      setMatches(data.contactMatches?.map((c: Match) => ({ ...c, reason: "name + company" })) ?? []);
      setAccounts(data.accountMatches ?? []);
      if (!s) setMessage("Automatic extraction is unavailable. Fill the review fields from your debrief, then save.");
      setStage("review");
    } catch {
      setReview({ ...EMPTY_REVIEW, conversationSummary: transcript });
      setStage("review");
      setMessage("Extraction failed. Your debrief is safe here; fill the review fields manually.");
    } finally { setProcessing(false); }
  }

  async function save() {
    if (!ownerId || saving) { setMessage("Choose the CRM owner before saving."); return; }
    setSaving(true); setMessage("");
    try {
      const res = await fetch("/api/capture/quick", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...review, transcript, ownerId, eventName, eventDate, location, idempotencyKey: key }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setMessage(`${res.status === 409 ? "CONFLICT · " : ""}${data.error || "Save failed. Your capture is preserved; retry safely."}`); return; }
      setSaved(data); setStage("saved"); localStorage.removeItem(STORAGE_KEY);
    } catch { setMessage("Network error. Your confirmed capture is preserved on this phone; retry safely."); }
    finally { setSaving(false); }
  }

  function captureAnother() {
    setTranscript(""); setReview(EMPTY_REVIEW); setMatches([]); setAccounts([]); setSuggestion(null);
    setKey(crypto.randomUUID()); setSaved(null); setMessage(""); setStage("capture");
  }

  const input = (field: keyof Review, label: string, state: "EXTRACTED" | "AI_INTERPRETATION" | "USER_STATED" = "EXTRACTED", multiline = false) => (
    <label className="block space-y-1.5" key={field}>
      {editableLabel(label, suggestion ? state : "USER_STATED")}
      {multiline ? <textarea value={review[field]} onChange={(e) => update(field, e.target.value)} rows={3} className="input text-base w-full" /> : <input type={field === "email" ? "email" : field === "phone" ? "tel" : "text"} value={review[field]} onChange={(e) => update(field, e.target.value)} className="input py-3 text-base w-full" />}
      {suggestion?.evidenceByField[field] && <span className="block text-xs text-gray-500">Heard: “{suggestion.evidenceByField[field]}”</span>}
    </label>
  );

  return <div className="max-w-lg mx-auto p-4 pb-28 space-y-4">
    <div><Link href="/" className="text-sm text-gray-500">← CRM</Link><h1 className="text-2xl font-bold mt-1">Quick Capture</h1><p className="text-sm text-gray-600">Post-conversation debrief · {eventName}</p></div>
    {message && <div role="alert" className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900">{message}</div>}

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
      <div className="card p-4 space-y-4">
        <h2 className="text-lg font-bold">Review capture</h2>
        <p className="text-xs text-gray-600">These are suggestions until you tap Confirm &amp; Save. Check names, commitments and dates.</p>
        {input("personName", "Name (leave blank if unknown)")}
        {input("companyName", "Company")}
        {input("statedRole", "Stated role / title")}
        <label className="block space-y-1.5">{editableLabel("Product / venture", suggestion ? "EXTRACTED" : "USER_STATED")}<select className="input py-3 w-full text-base" value={review.productKey} onChange={(e) => update("productKey", e.target.value)}><option value="">Unknown</option>{BUSINESS_LINES.map((product) => <option key={product} value={product}>{PRODUCTS_META[product].label}</option>)}</select></label>
        {input("conversationSummary", "Conversation summary", "EXTRACTED", true)}
        {input("relationshipContext", "Relationship context · interpretation", "AI_INTERPRETATION")}
        {input("theirCommitment", "Their commitment")}
        {input("myCommitment", "My commitment · verify before confirming", "AI_INTERPRETATION")}
        {input("nextAction", "Next action")}
        <label className="block space-y-1.5">{editableLabel("Task due date · internal target", suggestion ? "EXTRACTED" : "USER_STATED")}<input type="date" value={review.dueDate} onChange={(e) => update("dueDate", e.target.value)} className="input py-3 w-full text-base" /></label>
        {input("notes", "Additional notes", "USER_STATED", true)}
      </div>
      <div className="card p-4 space-y-3">
        <h2 className="font-bold">CRM match</h2>
        <p className="text-xs text-gray-600">CRM_EXISTING matches are suggestions. Select an existing person explicitly.</p>
        {input("email", "Email, if provided", "USER_STATED")}
        {input("phone", "Phone, if provided", "USER_STATED")}
        <button onClick={() => findMatches(review)} className="btn-secondary w-full justify-center py-2">Check matches</button>
        <label className="block text-sm">Contact<select className="input w-full mt-1 py-3" value={review.contactId} onChange={(e) => { const chosen = matches.find((m) => m.id === e.target.value); setReview((r) => ({ ...r, contactId: e.target.value, accountId: chosen?.accountId || r.accountId, companyName: chosen?.company || r.companyName })); }}><option value="">No confident match · create new only if name + company</option>{matches.map((m) => <option key={m.id} value={m.id}>{m.name} · {m.company} ({m.reason})</option>)}</select></label>
        <label className="block text-sm">Account<select className="input w-full mt-1 py-3" value={review.accountId} onChange={(e) => update("accountId", e.target.value)}><option value="">Match by exact company name or create</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
      </div>
      <div className="card p-4 space-y-3">
        <h2 className="font-bold">Event and owner</h2>
        <label className="block text-sm">Event<input value={eventName} onChange={(e) => setEventName(e.target.value)} className="input w-full mt-1 py-3" /></label>
        <label className="block text-sm">Event date<input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} className="input w-full mt-1 py-3" /></label>
        <label className="block text-sm">Location<input value={location} onChange={(e) => setLocation(e.target.value)} className="input w-full mt-1 py-3" /></label>
        <p className="text-xs text-gray-500">Source: EVENT · Acquisition: IN_PERSON · Interaction: MET_PERSONALLY</p>
        <label className="block text-sm font-semibold">CRM owner<select value={ownerId} onChange={(e) => { setOwnerId(e.target.value); localStorage.setItem("arqone-crm.currentUserId", e.target.value); }} className="input w-full mt-1 py-3"><option value="">Choose owner</option>{members.map((member) => <option value={member.id} key={member.id}>{member.name}</option>)}</select></label>
      </div>
      <details className="text-sm text-gray-600"><summary className="cursor-pointer">Original debrief · source visible</summary><p className="whitespace-pre-wrap mt-2">{transcript}</p><button onClick={() => setStage("capture")} className="text-brand-700 underline mt-2">Edit debrief</button></details>
      <div className="fixed bottom-0 left-0 right-0 max-w-lg mx-auto bg-white border-t p-3 flex gap-2"><button onClick={() => setStage("capture")} className="btn-secondary py-3 px-4">Back</button><button onClick={save} disabled={saving || !ownerId} className="btn-primary flex-1 justify-center py-3 text-base disabled:opacity-50">{saving ? "Saving…" : "Confirm & Save"}</button></div>
    </>}

    {stage === "saved" && saved && <div className="card p-6 space-y-4 text-center"><div className="mx-auto rounded-full bg-green-100 text-green-700 w-14 h-14 flex items-center justify-center"><Check /></div><h2 className="text-xl font-bold">Saved</h2><p className="text-xs text-green-700 font-semibold">USER_CONFIRMED</p><p className="text-sm text-gray-600">{saved.contactId ? "Contact linked" : "No person invented"} · Activity saved{saved.taskId ? " · Task saved" : ""}</p><button onClick={captureAnother} className="btn-primary w-full justify-center py-4 text-base"><RotateCcw size={17} /> Capture another</button>{saved.contactId && <Link href={`/contacts/${saved.contactId}`} className="btn-secondary w-full justify-center py-3">Open contact</Link>}{saved.leadId && <Link href={`/leads/${saved.leadId}`} className="btn-secondary w-full justify-center py-3">Open lead</Link>}</div>}
  </div>;
}

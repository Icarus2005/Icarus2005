"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Mic, Check } from "lucide-react";
import { BUSINESS_LINES, PRODUCTS_META, isProductKey, type ProductKey } from "@/lib/products";
import { CAPTURE_ACQUISITION_OPTIONS, type CaptureAcquisitionKey } from "@/lib/capture/eventCapture";

/**
 * Quick Capture — event-capture MVP (Sprint 06E).
 *
 * Mobile-first: one column, large tap targets, minimal scrolling, Save
 * always reachable. Captures exactly what's entered — no inference, no
 * auto-qualification, no Opportunity creation, no email sending.
 */

const DEFAULT_EVENT_NAME = "Seamless Middle East 2026";

type SavedRecord = { accountId: string; contactId: string; leadId: string; taskId: string | null; fullName: string; company: string };

function dateOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

function hasSpeechRecognition(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean((window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }).SpeechRecognition || (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition);
}

function CaptureEventForm() {
  const searchParams = useSearchParams();
  const prefillProduct = searchParams.get("product");

  const [eventName, setEventName] = useState(DEFAULT_EVENT_NAME);
  const [fullName, setFullName] = useState("");
  const [company, setCompany] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [product, setProduct] = useState<ProductKey | "">(prefillProduct && isProductKey(prefillProduct) ? prefillProduct : "");
  const [acquisitionKey, setAcquisitionKey] = useState<CaptureAcquisitionKey | null>(null);
  const [note, setNote] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState<{ existingContactName: string; existingAccountName: string | null } | null>(null);
  const [saved, setSaved] = useState<SavedRecord | null>(null);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<{ start: () => void; stop: () => void } | null>(null);

  useEffect(() => {
    setIdempotencyKey(crypto.randomUUID());
  }, []);

  function resetForm() {
    setFullName("");
    setCompany("");
    setJobTitle("");
    setEmail("");
    setPhone("");
    setLinkedin("");
    setAcquisitionKey(null);
    setNote("");
    setNextAction("");
    setDueDate("");
    setError("");
    setConflict(null);
    setSaved(null);
    setIdempotencyKey(crypto.randomUUID());
  }

  function toggleDictation() {
    if (!hasSpeechRecognition()) return;
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const SR = (window as unknown as { SpeechRecognition?: new () => unknown; webkitSpeechRecognition?: new () => unknown }).SpeechRecognition
      ?? (window as unknown as { webkitSpeechRecognition?: new () => unknown }).webkitSpeechRecognition;
    if (!SR) return;
    type RecognitionEvent = { results: { transcript: string }[][] };
    const recognition = new SR() as { start: () => void; stop: () => void; onresult: ((e: RecognitionEvent) => void) | null; onend: (() => void) | null; continuous: boolean; interimResults: boolean };
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.onresult = (e: RecognitionEvent) => {
      const transcript = Array.from(e.results).map((r) => r[0].transcript).join(" ");
      setNote((prev) => (prev ? `${prev} ${transcript}` : transcript));
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }

  async function submit(confirmReviewRequired = false) {
    setSaving(true);
    setError("");
    setConflict(null);
    try {
      const res = await fetch("/api/capture/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventName,
          fullName,
          company,
          jobTitle: jobTitle || undefined,
          email: email || undefined,
          phone: phone || undefined,
          linkedin: linkedin || undefined,
          product,
          acquisitionKey: acquisitionKey || undefined,
          note: note || undefined,
          nextAction: nextAction || undefined,
          dueDate: dueDate || undefined,
          idempotencyKey,
          confirmReviewRequired,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409 && data.classification === "REVIEW_REQUIRED") {
        setConflict(data.conflict);
        return;
      }
      if (!res.ok) {
        setError(data.error ?? "Failed to save.");
        return;
      }
      setSaved({ accountId: data.accountId, contactId: data.contactId, leadId: data.leadId, taskId: data.taskId, fullName, company });
    } catch {
      setError("Network error — nothing was saved. Try again.");
    } finally {
      setSaving(false);
    }
  }

  if (saved) {
    return (
      <div className="p-5 max-w-md mx-auto">
        <div className="card p-6 text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-green-100 text-green-600 flex items-center justify-center mx-auto">
            <Check size={24} aria-hidden />
          </div>
          <div>
            <p className="text-sm text-gray-500">Saved</p>
            <p className="text-lg font-bold text-gray-900">{saved.fullName}</p>
            <p className="text-sm text-gray-600">{saved.company}</p>
          </div>
          <div className="flex flex-col gap-2 pt-2">
            <button onClick={resetForm} className="btn-primary w-full justify-center py-3 text-base">Capture another</button>
            <Link href={`/contacts/${saved.contactId}`} className="btn-secondary w-full justify-center py-3 text-base">Open contact</Link>
            <Link href={`/leads/${saved.leadId}`} className="btn-secondary w-full justify-center py-3 text-base">Open lead</Link>
          </div>
        </div>
      </div>
    );
  }

  const canSave = fullName.trim() && company.trim() && product && !saving;

  return (
    <div className="p-4 pb-28 max-w-md mx-auto">
      <div className="mb-4">
        <Link href="/leads" className="text-sm text-gray-500 hover:text-gray-700">← Leads</Link>
        <h1 className="text-xl font-bold text-gray-900 mt-1">Quick Capture</h1>
      </div>

      <div className="card p-4 mb-4">
        <label className="label">Event</label>
        <input value={eventName} onChange={(e) => setEventName(e.target.value)} className="input py-3 text-base" />
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg mb-4">{error}</div>}

      {conflict && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4 space-y-2">
          <p className="text-sm text-gray-800">
            This email already belongs to <span className="font-semibold">{conflict.existingContactName}</span>
            {conflict.existingAccountName ? ` at ${conflict.existingAccountName}` : ""}. Nothing was saved yet.
          </p>
          <div className="flex flex-col gap-2">
            <button onClick={() => submit(true)} disabled={saving} className="btn-secondary w-full justify-center py-2.5 text-sm">
              Proceed anyway (create a separate contact)
            </button>
            <button onClick={() => setConflict(null)} className="text-sm text-gray-500 hover:text-gray-700">Cancel and edit</button>
          </div>
        </div>
      )}

      <div className="card p-4 mb-4 space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Person</p>
        <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Full name *" className="input py-3 text-base" />
        <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Company *" className="input py-3 text-base" />
        <input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="Job title" className="input py-3 text-base" />
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" type="email" className="input py-3 text-base" />
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" type="tel" className="input py-3 text-base" />
        <input value={linkedin} onChange={(e) => setLinkedin(e.target.value)} placeholder="LinkedIn URL" className="input py-3 text-base" />
      </div>

      <div className="card p-4 mb-4 space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Product *</p>
        <div className="grid grid-cols-2 gap-2">
          {BUSINESS_LINES.map((key) => (
            <button
              key={key}
              onClick={() => setProduct(key)}
              className={`py-3 px-3 rounded-xl text-sm font-medium border text-center ${
                product === key ? "border-brand-600 bg-brand-50 text-brand-700" : "border-gray-200 text-gray-600"
              }`}
            >
              {PRODUCTS_META[key].label}
            </button>
          ))}
        </div>

        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide pt-1">How acquired</p>
        <div className="grid grid-cols-2 gap-2">
          {CAPTURE_ACQUISITION_OPTIONS.map((o) => (
            <button
              key={o.key}
              onClick={() => setAcquisitionKey(o.key)}
              className={`py-3 px-3 rounded-xl text-sm font-medium border text-center ${
                acquisitionKey === o.key ? "border-brand-600 bg-brand-50 text-brand-700" : "border-gray-200 text-gray-600"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div className="card p-4 mb-4 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Conversation note</p>
          {hasSpeechRecognition() && (
            <button
              onClick={toggleDictation}
              className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg border ${listening ? "border-red-400 text-red-600 bg-red-50" : "border-gray-200 text-gray-500"}`}
            >
              <Mic size={13} aria-hidden /> {listening ? "Listening…" : "Dictate"}
            </button>
          )}
        </div>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4} className="input resize-none text-base" placeholder="What did you talk about?" />
        <p className="text-[11px] text-gray-400">Voice fills this field only — review and edit before saving.</p>
      </div>

      <div className="card p-4 mb-4 space-y-2">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Next action</p>
        <input value={nextAction} onChange={(e) => setNextAction(e.target.value)} placeholder="e.g. Send PlacePulse intro" className="input py-3 text-base" />
        <div className="flex flex-wrap gap-2">
          {[{ label: "Today", days: 0 }, { label: "Tomorrow", days: 1 }, { label: "+2 days", days: 2 }, { label: "Next week", days: 7 }].map((o) => (
            <button
              key={o.label}
              onClick={() => setDueDate(dateOffset(o.days))}
              className={`text-xs px-3 py-2 rounded-lg border ${dueDate === dateOffset(o.days) ? "border-brand-600 bg-brand-50 text-brand-700" : "border-gray-200 text-gray-600"}`}
            >
              {o.label}
            </button>
          ))}
        </div>
        <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="input py-3 text-base" />
        <p className="text-[11px] text-gray-400">Internal follow-up target only — never a client commitment.</p>
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-3 max-w-md mx-auto">
        <button onClick={() => submit(false)} disabled={!canSave} className="btn-primary w-full justify-center py-3.5 text-base disabled:opacity-50">
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

export default function CaptureEventPage() {
  return (
    <Suspense fallback={<div className="p-8 text-gray-400">Loading…</div>}>
      <CaptureEventForm />
    </Suspense>
  );
}

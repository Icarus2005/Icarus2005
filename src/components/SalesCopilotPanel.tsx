"use client";

import { useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";

/**
 * Sales Copilot panel (Sprint 06C Phase 3/6; Sprint 06D Phase 3/4/6/7/8).
 *
 * Draft + recommend by default. The only writes this component can trigger:
 * - "Save as draft note" — reuses the existing Activity API (type NOTE).
 * - "Approve & Send" — requires a deliberate click AND a confirmation step,
 *   never fires on generation/regeneration/page load, and only reaches
 *   Zoho through the server-side /api/email/send route. A successful send
 *   is the only thing that can mark the panel's "Sent" state; nothing here
 *   simulates a send when the email provider isn't configured.
 */

type EntityType = "LEAD" | "CONTACT" | "OPPORTUNITY";
type Action = "NEXT_ACTION" | "DRAFT_EMAIL" | "MEETING_OBJECTIVE";

type NextActionResult = {
  recommendedAction: string;
  why: string;
  objective: string;
  timing: string;
  taskSuggestion: string | null;
};
type DraftEmailResult = {
  subject: string;
  body: string;
  objective: string;
  keyContextUsed: string[];
  missingContext: string | null;
};
type MeetingObjectiveResult = {
  objective: string;
  questions: string[];
  knownContext: string;
  desiredNextStep: string;
  risks: string[];
};
type Recipient = {
  contactId: string | null;
  contactEmail: string | null;
  contactName: string | null;
  candidateTaskId: string | null;
  candidateTaskTitle: string | null;
};

const ACTIONS: { key: Action; label: string }[] = [
  { key: "NEXT_ACTION", label: "What should I do next?" },
  { key: "DRAFT_EMAIL", label: "Draft follow-up email" },
  { key: "MEETING_OBJECTIVE", label: "Prepare meeting objective" },
];

type SendState = "idle" | "confirming" | "sending" | "sent" | "error";

export default function SalesCopilotPanel({
  entityType,
  entityId,
  relatedIds,
}: {
  entityType: EntityType;
  entityId: string;
  /** Optional links to carry into "Save as draft note" / sent Activity — same pattern as Log Activity prefill. */
  relatedIds?: { accountId?: string | null; contactId?: string | null; leadId?: string | null; opportunityId?: string | null };
}) {
  const [activeAction, setActiveAction] = useState<Action | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [nextAction, setNextAction] = useState<NextActionResult | null>(null);
  const [emailDraft, setEmailDraft] = useState<DraftEmailResult | null>(null);
  const [meeting, setMeeting] = useState<MeetingObjectiveResult | null>(null);
  const [editableBody, setEditableBody] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied">("idle");

  // Approval/send state (Sprint 06D)
  const [recipient, setRecipient] = useState<Recipient | null>(null);
  const [emailConfigured, setEmailConfigured] = useState(false);
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [sendState, setSendState] = useState<SendState>("idle");
  const [sendError, setSendError] = useState("");
  const [sentAt, setSentAt] = useState<string | null>(null);
  const [taskAction, setTaskAction] = useState<"idle" | "completing" | "completed">("idle");
  const [followUp, setFollowUp] = useState<{ open: boolean; title: string; dueDate: string; status: "idle" | "saving" | "saved" }>({
    open: false,
    title: "",
    dueDate: "",
    status: "idle",
  });

  async function run(action: Action) {
    setActiveAction(action);
    setLoading(true);
    setError("");
    setSaveStatus("idle");
    setCopyStatus("idle");
    setSendState("idle");
    setSendError("");
    setSentAt(null);
    setTaskAction("idle");
    setFollowUp({ open: false, title: "", dueDate: "", status: "idle" });
    try {
      const res = await fetch("/api/sales-copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entityType, entityId, action }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Sales Copilot request failed.");
      }
      const data = await res.json();
      if (action === "NEXT_ACTION") setNextAction(data.result as NextActionResult);
      if (action === "DRAFT_EMAIL") {
        const result = data.result as DraftEmailResult;
        setEmailDraft(result);
        setEditableBody(result.body);
        setSubject(result.subject);
        const r = data.recipient as Recipient;
        setRecipient(r);
        setTo(r.contactEmail ?? "");
        setCc("");
        setEmailConfigured(Boolean(data.emailConfigured));
        setIdempotencyKey(crypto.randomUUID());
      }
      if (action === "MEETING_OBJECTIVE") setMeeting(data.result as MeetingObjectiveResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function saveAsDraftNote() {
    if (!emailDraft) return;
    setSaveStatus("saving");
    try {
      const res = await fetch("/api/activities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "NOTE",
          subject: `Draft follow-up email (Sales Copilot): ${subject}`,
          notes: editableBody,
          ...relatedIds,
        }),
      });
      setSaveStatus(res.ok ? "saved" : "error");
    } catch {
      setSaveStatus("error");
    }
  }

  async function copyDraft() {
    try {
      await navigator.clipboard.writeText(editableBody);
      setCopyStatus("copied");
      setTimeout(() => setCopyStatus("idle"), 1500);
    } catch {
      // Clipboard access can be denied by the browser — non-fatal, no draft is lost.
    }
  }

  async function confirmSend() {
    if (!recipient?.contactId || sendState === "sending" || sendState === "sent") return;
    setSendState("sending");
    setSendError("");
    try {
      const res = await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityType,
          entityId,
          contactId: recipient.contactId,
          to,
          cc: cc || undefined,
          subject,
          plaintextBody: editableBody,
          idempotencyKey,
          taskId: recipient.candidateTaskId ?? undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSendError(data.error ?? "Failed to send email.");
        setSendState("error");
        return;
      }
      setSentAt(data.activity?.date ?? new Date().toISOString());
      setSendState("sent");
    } catch {
      setSendError("Network error while sending — the draft was not sent.");
      setSendState("error");
    }
  }

  async function completeRelatedTask() {
    if (!recipient?.candidateTaskId) return;
    setTaskAction("completing");
    try {
      await fetch(`/api/tasks/${recipient.candidateTaskId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "DONE" }),
      });
      setTaskAction("completed");
    } catch {
      setTaskAction("idle");
    }
  }

  async function saveFollowUp() {
    if (!followUp.title.trim()) return;
    setFollowUp((f) => ({ ...f, status: "saving" }));
    try {
      await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: followUp.title,
          dueDate: followUp.dueDate || undefined,
          ...relatedIds,
        }),
      });
      setFollowUp((f) => ({ ...f, status: "saved" }));
    } catch {
      setFollowUp((f) => ({ ...f, status: "idle" }));
    }
  }

  const recipientChanged = Boolean(recipient?.contactEmail && to && to !== recipient.contactEmail);
  const hasUsableRecipient = isValidEmailClient(to);
  const canSend = emailConfigured && hasUsableRecipient && sendState !== "sending" && sendState !== "sent";

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles size={16} className="text-brand-600" aria-hidden />
        <h2 className="text-sm font-semibold text-gray-700">Sales Copilot</h2>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {ACTIONS.map((a) => (
          <button
            key={a.key}
            onClick={() => run(a.key)}
            disabled={loading}
            className={`text-xs px-3 py-1.5 rounded-lg border ${
              activeAction === a.key ? "border-brand-600 text-brand-700 bg-brand-50" : "border-gray-200 text-gray-600 hover:border-gray-300"
            } disabled:opacity-50`}
          >
            {a.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-gray-400 py-4">
          <Loader2 size={14} className="animate-spin" aria-hidden /> Thinking...
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {!loading && activeAction === "NEXT_ACTION" && nextAction && (
        <div className="space-y-2 text-sm">
          <p><span className="font-semibold text-gray-700">Recommended next action:</span> {nextAction.recommendedAction}</p>
          <p><span className="font-semibold text-gray-700">Why:</span> {nextAction.why}</p>
          <p><span className="font-semibold text-gray-700">Objective:</span> {nextAction.objective}</p>
          <p><span className="font-semibold text-gray-700">Timing:</span> {nextAction.timing}</p>
          {nextAction.taskSuggestion && (
            <p><span className="font-semibold text-gray-700">Suggested task:</span> {nextAction.taskSuggestion}</p>
          )}
          <p className="text-xs text-gray-400 italic">Advisory only — nothing was created or changed.</p>
          <button onClick={() => run("NEXT_ACTION")} className="text-xs text-brand-600 hover:underline">Regenerate</button>
        </div>
      )}

      {!loading && activeAction === "DRAFT_EMAIL" && emailDraft && sendState !== "sent" && (
        <div className="space-y-3 text-sm">
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">To</label>
            <input value={to} onChange={(e) => setTo(e.target.value)} className="input mt-1" placeholder="recipient@example.com" />
            {!recipient?.contactEmail && (
              <p className="text-xs text-amber-600 mt-1">This Contact has no email on file — enter one to enable sending, or Copy/Save the draft instead.</p>
            )}
            {recipientChanged && (
              <p className="text-xs text-amber-600 mt-1">Differs from the CRM contact&apos;s email on file ({recipient?.contactEmail}). The Contact record will not be changed.</p>
            )}
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">CC (optional)</label>
            <input value={cc} onChange={(e) => setCc(e.target.value)} className="input mt-1" placeholder="" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Subject</label>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} className="input mt-1" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Body</label>
            <textarea
              value={editableBody}
              onChange={(e) => setEditableBody(e.target.value)}
              rows={10}
              className="input resize-none font-mono text-xs mt-1"
            />
          </div>
          {emailDraft.missingContext && (
            <p className="text-xs text-amber-600"><span className="font-semibold">Missing context:</span> {emailDraft.missingContext}</p>
          )}
          {!emailConfigured && (
            <p className="text-xs text-gray-500 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
              Email sending is not configured for this workspace — drafting, editing, copying, and saving as a note all still work.
            </p>
          )}

          <div className="flex flex-wrap gap-3 items-center pt-1">
            <button onClick={() => run("DRAFT_EMAIL")} className="text-xs text-brand-600 hover:underline">Regenerate</button>
            <button onClick={copyDraft} className="text-xs text-brand-600 hover:underline">{copyStatus === "copied" ? "Copied" : "Copy"}</button>
            <button onClick={saveAsDraftNote} disabled={saveStatus === "saving"} className="text-xs text-brand-600 hover:underline disabled:opacity-50">
              {saveStatus === "saving" ? "Saving..." : saveStatus === "saved" ? "Saved as note" : "Save as draft note"}
            </button>
            {saveStatus === "error" && <span className="text-xs text-red-600">Failed to save.</span>}
          </div>

          <div className="border-t border-gray-100 pt-3">
            {sendState === "idle" || sendState === "error" ? (
              <button
                onClick={() => setSendState("confirming")}
                disabled={!canSend}
                className="btn-primary text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                title={!emailConfigured ? "Email sending is not configured" : !hasUsableRecipient ? "A valid recipient email is required" : undefined}
              >
                Approve &amp; Send
              </button>
            ) : (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
                <p className="text-sm text-gray-800">Send this email to <span className="font-semibold">{to}</span>?</p>
                <div className="flex gap-2">
                  <button onClick={confirmSend} disabled={sendState === "sending"} className="btn-primary text-xs disabled:opacity-50">
                    {sendState === "sending" ? "Sending..." : "Confirm & Send"}
                  </button>
                  <button onClick={() => setSendState("idle")} disabled={sendState === "sending"} className="btn-secondary text-xs">Cancel</button>
                </div>
              </div>
            )}
            {sendState === "error" && <p className="text-xs text-red-600 mt-2">{sendError} — the draft has been preserved, nothing was sent.</p>}
            <p className="text-xs text-gray-400 italic mt-2">Approve &amp; Send is the only action that sends anything. Regenerating, editing, or copying never sends.</p>
          </div>
        </div>
      )}

      {!loading && activeAction === "DRAFT_EMAIL" && sendState === "sent" && (
        <div className="space-y-3 text-sm">
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 space-y-1">
            <p className="font-semibold text-green-800">Sent</p>
            <p className="text-gray-700">Recipient: {to}</p>
            <p className="text-gray-700">Subject: {subject}</p>
            {sentAt && <p className="text-gray-500 text-xs">{new Date(sentAt).toLocaleString()}</p>}
          </div>

          {recipient?.candidateTaskId && (
            <div className="flex items-center gap-3">
              <button onClick={completeRelatedTask} disabled={taskAction !== "idle"} className="text-xs text-brand-600 hover:underline disabled:opacity-50">
                {taskAction === "completed" ? "Task marked complete" : taskAction === "completing" ? "Completing..." : `Mark related task complete (${recipient.candidateTaskTitle})`}
              </button>
            </div>
          )}

          {!followUp.open && followUp.status !== "saved" && (
            <button onClick={() => setFollowUp((f) => ({ ...f, open: true }))} className="text-xs text-brand-600 hover:underline">
              Create follow-up reminder
            </button>
          )}
          {followUp.open && followUp.status !== "saved" && (
            <div className="bg-gray-50 border border-gray-100 rounded-lg p-3 space-y-2">
              <input
                value={followUp.title}
                onChange={(e) => setFollowUp((f) => ({ ...f, title: e.target.value }))}
                placeholder="Follow-up task title"
                className="input"
              />
              <input
                type="date"
                value={followUp.dueDate}
                onChange={(e) => setFollowUp((f) => ({ ...f, dueDate: e.target.value }))}
                className="input"
              />
              <p className="text-[11px] text-gray-400">Internal follow-up target only — never a client commitment date.</p>
              <button onClick={saveFollowUp} disabled={followUp.status === "saving" || !followUp.title.trim()} className="text-xs text-brand-600 hover:underline disabled:opacity-50">
                {followUp.status === "saving" ? "Saving..." : "Save reminder"}
              </button>
            </div>
          )}
          {followUp.status === "saved" && <p className="text-xs text-green-700">Follow-up reminder created.</p>}
        </div>
      )}

      {!loading && activeAction === "MEETING_OBJECTIVE" && meeting && (
        <div className="space-y-2 text-sm">
          <p><span className="font-semibold text-gray-700">Objective:</span> {meeting.objective}</p>
          <div>
            <p className="font-semibold text-gray-700">Questions to ask:</p>
            <ul className="list-disc list-inside text-gray-600">
              {meeting.questions.map((q, i) => <li key={i}>{q}</li>)}
            </ul>
          </div>
          <p><span className="font-semibold text-gray-700">Desired next step:</span> {meeting.desiredNextStep}</p>
          {meeting.risks.length > 0 && (
            <div>
              <p className="font-semibold text-gray-700">Risks / unknowns:</p>
              <ul className="list-disc list-inside text-gray-600">
                {meeting.risks.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </div>
          )}
          <button onClick={() => run("MEETING_OBJECTIVE")} className="text-xs text-brand-600 hover:underline">Regenerate</button>
        </div>
      )}
    </div>
  );
}

function isValidEmailClient(addr: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr);
}

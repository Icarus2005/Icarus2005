"use client";

import { useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";

/**
 * Sales Copilot panel (Sprint 06C, Phase 3/6).
 *
 * Draft + recommend only — this component never sends anything externally
 * and never writes to the CRM except the explicit "Save as draft note"
 * action, which the user must click deliberately and which reuses the
 * existing, already-validated Activity API (type NOTE).
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

const ACTIONS: { key: Action; label: string }[] = [
  { key: "NEXT_ACTION", label: "What should I do next?" },
  { key: "DRAFT_EMAIL", label: "Draft follow-up email" },
  { key: "MEETING_OBJECTIVE", label: "Prepare meeting objective" },
];

export default function SalesCopilotPanel({
  entityType,
  entityId,
  relatedIds,
}: {
  entityType: EntityType;
  entityId: string;
  /** Optional links to carry into "Save as draft note" — same pattern as Log Activity prefill. */
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

  async function run(action: Action) {
    setActiveAction(action);
    setLoading(true);
    setError("");
    setSaveStatus("idle");
    setCopyStatus("idle");
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
        setEmailDraft(data.result as DraftEmailResult);
        setEditableBody((data.result as DraftEmailResult).body);
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
          subject: `Draft follow-up email (Sales Copilot): ${emailDraft.subject}`,
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

      {!loading && activeAction === "DRAFT_EMAIL" && emailDraft && (
        <div className="space-y-3 text-sm">
          <p><span className="font-semibold text-gray-700">Subject:</span> {emailDraft.subject}</p>
          <textarea
            value={editableBody}
            onChange={(e) => setEditableBody(e.target.value)}
            rows={10}
            className="input resize-none font-mono text-xs"
          />
          <p className="text-xs text-gray-500"><span className="font-semibold">Objective:</span> {emailDraft.objective}</p>
          {emailDraft.keyContextUsed.length > 0 && (
            <p className="text-xs text-gray-500"><span className="font-semibold">Context used:</span> {emailDraft.keyContextUsed.join(", ")}</p>
          )}
          {emailDraft.missingContext && (
            <p className="text-xs text-amber-600"><span className="font-semibold">Missing context:</span> {emailDraft.missingContext}</p>
          )}
          <div className="flex flex-wrap gap-3 items-center pt-1">
            <button onClick={() => run("DRAFT_EMAIL")} className="text-xs text-brand-600 hover:underline">Regenerate</button>
            <button onClick={copyDraft} className="text-xs text-brand-600 hover:underline">{copyStatus === "copied" ? "Copied" : "Copy"}</button>
            <button onClick={saveAsDraftNote} disabled={saveStatus === "saving"} className="text-xs text-brand-600 hover:underline disabled:opacity-50">
              {saveStatus === "saving" ? "Saving..." : saveStatus === "saved" ? "Saved as note" : "Save as draft note"}
            </button>
            {saveStatus === "error" && <span className="text-xs text-red-600">Failed to save.</span>}
          </div>
          <p className="text-xs text-gray-400 italic">Draft only — nothing is sent. No external communication occurs.</p>
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

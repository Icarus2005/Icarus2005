"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight, Check, Loader2, Mail, PlayCircle, Send, Archive,
} from "lucide-react";
import ProductBadge from "@/components/ProductBadge";
import { STAGE_META, type ProposalStage } from "@/lib/proposals/stages";
import { fmtMoney, fmtDate } from "@/lib/format";

type Proposal = {
  id: string;
  title: string;
  product: string;
  stage: string;
  clientName: string | null;
  estimatedValue: number | null;
  requirements: string | null;
  research: string | null;
  draftContent: string | null;
  formatted: string | null;
  emailDraft: string | null;
  failureReason: string | null;
  generatedBy: string | null;
  stageChangedAt: string;
  account: { id: string; name: string } | null;
  owner: { id: string; name: string } | null;
  opportunity: { id: string; name: string } | null;
  transcript: { id: string; title: string; meetingDate: string; triageScore: number | null } | null;
  events: { id: string; stage: string; status: string; detail: string | null; createdAt: string }[];
};

const TABS = ["Document", "Requirements", "Research", "Email", "History"] as const;

export default function ProposalDetail({ proposal }: { proposal: Proposal }) {
  const router = useRouter();
  const [p, setP] = useState(proposal);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [tab, setTab] = useState<(typeof TABS)[number]>("Document");

  const meta = STAGE_META[p.stage as ProposalStage] ?? STAGE_META.QUEUED;

  async function call(path: string, label: string, body?: unknown) {
    setBusy(label);
    setError("");
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.ok) {
      const data = await res.json();
      // deliver returns { proposal, opportunity }
      const updated = data.proposal ?? data;
      setP((cur) => ({ ...cur, ...updated }));
      router.refresh();
    } else {
      const err = await res.json().catch(() => null);
      setError(err?.error ?? "Action failed.");
    }
    setBusy("");
  }

  async function setStage(stage: string, label: string) {
    setBusy(label);
    setError("");
    const res = await fetch(`/api/proposals/${p.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage }),
    });
    if (res.ok) {
      const updated = await res.json();
      setP((cur) => ({ ...cur, ...updated }));
      router.refresh();
    } else {
      setError("Could not change the stage.");
    }
    setBusy("");
  }

  const canRun = ["QUEUED", "ANALYZING", "RESEARCHING", "DRAFTING", "FORMATTING"].includes(p.stage);
  const body =
    tab === "Document" ? (p.formatted ?? p.draftContent)
    : tab === "Requirements" ? p.requirements
    : tab === "Research" ? p.research
    : tab === "Email" ? p.emailDraft
    : null;

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-6">
        <Link href="/proposals" className="text-sm text-gray-500 hover:text-gray-700">← Proposals</Link>
        <div className="flex items-center gap-3 mt-2 flex-wrap">
          <h1 className="text-2xl font-bold text-gray-900">{p.title}</h1>
          <ProductBadge product={p.product} size="md" />
          <span className={`badge ${meta.badge}`}>{meta.label}</span>
        </div>
        <p className="text-sm text-gray-500 mt-1">
          {p.account ? (
            <Link href={`/accounts/${p.account.id}`} className="text-brand-600 hover:underline">
              {p.account.name}
            </Link>
          ) : (p.clientName ?? "No account linked")}
          {p.estimatedValue != null && ` · ${fmtMoney(p.estimatedValue)}`}
          {p.owner && ` · ${p.owner.name}`}
          {" · "}
          {meta.description}
        </p>
        {p.transcript && (
          <p className="text-xs text-gray-400 mt-1">
            From call: {p.transcript.title} ({fmtDate(p.transcript.meetingDate)})
            {p.transcript.triageScore != null && ` · triage score ${p.transcript.triageScore}`}
          </p>
        )}
      </div>

      {error && (
        <div role="alert" className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg mb-4">
          {error}
        </div>
      )}
      {p.failureReason && (
        <div role="alert" className="bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-3 rounded-lg mb-4">
          Last run failed: {p.failureReason}
        </div>
      )}
      {p.generatedBy === "TEMPLATE" && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-3 rounded-lg mb-4">
          Generated from templates — no <code className="text-xs">ANTHROPIC_API_KEY</code> is configured, so
          placeholders need completing before this goes anywhere near a client.
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {canRun && (
          <>
            <button
              onClick={() => call(`/api/proposals/${p.id}/advance`, "step")}
              disabled={Boolean(busy)}
              className="btn-secondary disabled:opacity-60"
            >
              {busy === "step" ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <ArrowRight size={15} aria-hidden />}
              Next stage
            </button>
            <button
              onClick={() => call(`/api/proposals/${p.id}/advance?all=1`, "all")}
              disabled={Boolean(busy)}
              className="btn-primary disabled:opacity-60"
            >
              {busy === "all" ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <PlayCircle size={15} aria-hidden />}
              Run to review
            </button>
          </>
        )}
        {p.stage === "REVIEW" && (
          <button
            onClick={() => setStage("APPROVED", "approve")}
            disabled={Boolean(busy)}
            className="btn-primary disabled:opacity-60"
          >
            {busy === "approve" ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Check size={15} aria-hidden />}
            Approve
          </button>
        )}
        {p.stage === "APPROVED" && (
          <button
            onClick={() => call(`/api/proposals/${p.id}/deliver`, "deliver")}
            disabled={Boolean(busy)}
            className="btn-primary disabled:opacity-60"
          >
            {busy === "deliver" ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Send size={15} aria-hidden />}
            Deliver to CRM
          </button>
        )}
        {p.opportunity && (
          <Link href={`/opportunities/${p.opportunity.id}`} className="btn-secondary">
            View opportunity
          </Link>
        )}
        {!["DELIVERED", "ARCHIVED"].includes(p.stage) && (
          <button
            onClick={() => setStage("ARCHIVED", "archive")}
            disabled={Boolean(busy)}
            className="btn-secondary disabled:opacity-60 ml-auto"
          >
            <Archive size={15} aria-hidden /> Archive
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 mb-4" role="tablist" aria-label="Proposal sections">
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t
                ? "border-brand-600 text-brand-700"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "History" ? (
        <div className="card divide-y divide-gray-100">
          {p.events.length === 0 && <p className="p-6 text-sm text-gray-400">No runs recorded yet.</p>}
          {p.events.map((e) => (
            <div key={e.id} className="px-5 py-3 flex items-center gap-3">
              <span
                className={`badge ${
                  e.status === "FAILED"
                    ? "bg-red-100 text-red-700"
                    : e.status === "STARTED"
                      ? "bg-gray-100 text-gray-600"
                      : "bg-green-100 text-green-700"
                }`}
              >
                {e.status}
              </span>
              <span className="text-sm text-gray-700">
                {STAGE_META[e.stage as ProposalStage]?.label ?? e.stage}
              </span>
              {e.detail && <span className="text-xs text-gray-400 truncate">{e.detail}</span>}
              <span className="ml-auto text-xs text-gray-400 shrink-0">{fmtDate(e.createdAt)}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="card p-6">
          {body ? (
            <pre className="whitespace-pre-wrap font-sans text-sm text-gray-700 leading-relaxed">
              {body}
            </pre>
          ) : (
            <p className="text-sm text-gray-400">
              {tab === "Email" ? (
                <span className="inline-flex items-center gap-2">
                  <Mail size={14} aria-hidden /> The draft email is written when the proposal is delivered.
                </span>
              ) : (
                `Nothing generated for “${tab}” yet — run the pipeline.`
              )}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

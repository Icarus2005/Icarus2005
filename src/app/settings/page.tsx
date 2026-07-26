"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { COUNTRIES } from "@/lib/constants";
import {
  SALES_MOTIONS,
  FORECAST_CATEGORIES,
  HEALTH_STATUSES,
  PRODUCTS_META,
  ALL_PRODUCT_KEYS,
} from "@/lib/products";
import TeamPanel from "./TeamPanel";
import ProductsPanel from "./ProductsPanel";
import PipelinesPanel from "./PipelinesPanel";
import KnowledgePanel from "./KnowledgePanel";

const TABS = ["Workspace", "Team", "Products", "Pipelines", "Knowledge", "Markets", "Fields"] as const;
type Tab = (typeof TABS)[number];

function WorkspacePanel() {
  return (
    <div>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Workspace</h2>
        <p className="text-sm text-gray-500">Local instance configuration</p>
      </div>
      <div className="card p-5 space-y-3 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-500">Company</span>
          <span className="font-medium text-gray-900">ArqOne Labs</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Business Lines</span>
          <span className="font-medium text-gray-900">
            {ALL_PRODUCT_KEYS.filter((k) => k !== "UNASSIGNED").map((k) => PRODUCTS_META[k].label).join(" · ")}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Storage</span>
          <span className="font-medium text-gray-900">Postgres via <code className="text-xs">DATABASE_URL</code></span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Access control</span>
          <span className="font-medium text-gray-900">
            Shared password gate (<code className="text-xs">CRM_ACCESS_PASSWORD</code>) — per-user auth planned
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Proposal generation</span>
          <span className="font-medium text-gray-900">
            <code className="text-xs">ANTHROPIC_API_KEY</code> when set; templates otherwise
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Local reset</span>
          <span className="font-mono text-xs text-gray-700 bg-gray-50 px-2 py-1 rounded">npm run db:reset</span>
        </div>
      </div>
    </div>
  );
}

function MarketsPanel() {
  return (
    <div>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Markets</h2>
        <p className="text-sm text-gray-500">
          Canonical market codes stored on leads and opportunities (comma-separated for multi-market records).
        </p>
      </div>
      <div className="card divide-y divide-gray-100">
        {Object.entries(COUNTRIES).map(([code, name]) => (
          <div key={code} className="flex items-center justify-between px-5 py-3">
            <span className="text-sm text-gray-800">{name}</span>
            <span className="font-mono text-xs text-gray-400 bg-gray-50 px-2 py-0.5 rounded">{code}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FieldsPanel() {
  const groups: { title: string; note: string; values: Record<string, string> }[] = [
    { title: "Sales Motions", note: "Lead.salesMotion", values: SALES_MOTIONS },
    { title: "Forecast Categories", note: "Opportunity.forecastCategory", values: FORECAST_CATEGORIES },
    { title: "Health Statuses", note: "Opportunity.healthStatus", values: HEALTH_STATUSES },
  ];
  return (
    <div>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Fields</h2>
        <p className="text-sm text-gray-500">
          Canonical enumerated values used across the CRM. Stored as stable keys; labels are display-only.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {groups.map((g) => (
          <div key={g.title} className="card p-5">
            <p className="font-semibold text-gray-900 text-sm">{g.title}</p>
            <p className="text-xs text-gray-400 mb-3 font-mono">{g.note}</p>
            <div className="space-y-1.5">
              {Object.entries(g.values).map(([k, v]) => (
                <div key={k} className="flex items-center justify-between">
                  <span className="text-sm text-gray-700">{v}</span>
                  <span className="font-mono text-[11px] text-gray-400">{k}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SettingsInner() {
  const searchParams = useSearchParams();
  const raw = searchParams.get("tab");
  const tab: Tab = TABS.includes(raw as Tab) ? (raw as Tab) : "Workspace";

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-0.5">Workspace, team, products and pipeline configuration</p>
      </div>

      <div className="flex gap-1 border-b border-gray-200 mb-6 overflow-x-auto" role="tablist" aria-label="Settings sections">
        {TABS.map((t) => (
          <Link
            key={t}
            href={t === "Workspace" ? "/settings" : `/settings?tab=${t}`}
            role="tab"
            aria-selected={tab === t}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${
              tab === t
                ? "border-brand-600 text-brand-700"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            {t}
          </Link>
        ))}
      </div>

      {tab === "Workspace" && <WorkspacePanel />}
      {tab === "Team" && <TeamPanel />}
      {tab === "Products" && <ProductsPanel />}
      {tab === "Pipelines" && <PipelinesPanel />}
      {tab === "Knowledge" && <KnowledgePanel />}
      {tab === "Markets" && <MarketsPanel />}
      {tab === "Fields" && <FieldsPanel />}
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-gray-400">Loading…</div>}>
      <SettingsInner />
    </Suspense>
  );
}

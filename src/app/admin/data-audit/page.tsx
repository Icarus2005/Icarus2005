export const dynamic = "force-dynamic";

import { AlertTriangle } from "lucide-react";
import { getDataAudit } from "@/lib/dataAudit";
import CopyAuditButton from "./CopyAuditButton";
import Sprint03Panel from "./Sprint03Panel";
import Sprint04Panel from "./Sprint04Panel";
import Sprint05Panel from "./Sprint05Panel";
import Sprint05ExecutePanel from "./Sprint05ExecutePanel";

// Internal read-only production diagnostic. No database mutation paths exist
// on this page or in src/lib/dataAudit.ts — every query is a Prisma
// find/count, never create/update/delete/upsert. Access control is the
// application's existing CRM_ACCESS_PASSWORD gate (src/middleware.ts), which
// covers every route including this one — there is no separate per-user
// admin role in the schema yet (see CLAUDE.md roadmap), so this page relies
// on the same whole-app gate every other page relies on.
//
// This page must never render DATABASE_URL, DIRECT_URL, or any other
// secret/connection value — only aggregated application data.

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card p-6">
      <h2 className="text-sm font-semibold text-gray-700 mb-4">{title}</h2>
      {children}
    </div>
  );
}

function Distribution({ data }: { data: Record<string, number> }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return <p className="text-sm text-gray-400">No records.</p>;
  return (
    <div className="space-y-1.5">
      {entries.map(([k, v]) => (
        <div key={k} className="flex justify-between text-sm">
          <span className="text-gray-600">{k}</span>
          <span className="font-semibold text-gray-900">{v}</span>
        </div>
      ))}
    </div>
  );
}

function Stat({ label, value, flag }: { label: string; value: number | string; flag?: boolean }) {
  return (
    <div className="flex justify-between text-sm py-1">
      <span className="text-gray-600">{label}</span>
      <span className={`font-semibold ${flag && Number(value) > 0 ? "text-amber-600" : "text-gray-900"}`}>{value}</span>
    </div>
  );
}

function IdList({ items }: { items: { id: string; name?: string | null; title?: string | null; subject?: string | null; account?: string }[] }) {
  if (items.length === 0) return <p className="text-xs text-gray-400">None.</p>;
  return (
    <ul className="text-xs text-gray-600 space-y-0.5 max-h-40 overflow-auto">
      {items.map((i) => (
        <li key={i.id} className="truncate">
          {i.name ?? i.title ?? i.subject} <span className="text-gray-400">({i.id})</span>
        </li>
      ))}
    </ul>
  );
}

export default async function DataAuditPage() {
  const audit = await getDataAudit();
  const travelportTotal =
    audit.travelport.contacts.length +
    audit.travelport.leads.length +
    audit.travelport.accounts.length +
    audit.travelport.opportunities.length +
    audit.travelport.activities.length +
    audit.travelport.tasks.length;

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-center justify-between mb-2 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Production Data Audit</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Read-only diagnostic. Generated {new Date(audit.generatedAt).toLocaleString()}. No records are modified by this page.
          </p>
        </div>
        <CopyAuditButton audit={audit} />
      </div>

      <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-lg px-3 py-2 mb-6">
        <AlertTriangle size={14} className="mt-0.5 shrink-0" />
        Internal diagnostic tool — no create/update/delete actions exist on this page. Protected by the same access gate as the rest of the CRM.
      </div>

      <Section title="Summary">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          {Object.entries(audit.summary).map(([k, v]) => (
            <div key={k}>
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">{k}</p>
              <p className="text-xl font-bold text-gray-900 mt-0.5">{v}</p>
            </div>
          ))}
        </div>
      </Section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        <Section title="Accounts">
          <Stat label="Duplicate name groups" value={audit.accounts.duplicateNameGroups.length} flag />
          <Stat label="With PlacePulse leads" value={audit.accounts.accountsWithPlacePulseLeads} />
          <Stat label="With PlacePulse opportunities" value={audit.accounts.accountsWithPlacePulseOpportunities} />
          <Stat label="PlacePulse-implied, lacking AccountProduct" value={audit.accounts.accountsLackingAccountProduct.length} flag />
          {audit.accounts.duplicateNameGroups.length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <p className="text-xs font-semibold text-gray-500 mb-1">Duplicate name candidates</p>
              {audit.accounts.duplicateNameGroups.map((g, i) => (
                <p key={i} className="text-xs text-gray-600">{g.map((a) => a.name).join(" / ")}</p>
              ))}
            </div>
          )}
        </Section>

        <Section title="Contacts">
          <Stat label="Duplicate emails" value={audit.contacts.duplicateEmails.length} flag />
          <Stat label="Duplicate name+account" value={audit.contacts.duplicateNameAccountGroups.length} flag />
          <Stat label="Missing provenance" value={audit.contacts.missingProvenance} />
          <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-1">Role</p>
              <Distribution data={audit.contacts.roleDistribution} />
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-1">Relationship Strength</p>
              <Distribution data={audit.contacts.relationshipStrengthDistribution} />
            </div>
          </div>
        </Section>

        <Section title="Leads">
          <div className="grid grid-cols-2 gap-4 mb-3">
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-1">Status</p>
              <Distribution data={audit.leads.statusDistribution} />
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-1">Source</p>
              <Distribution data={audit.leads.sourceDistribution} />
            </div>
          </div>
          <Stat label="Company matches an Account" value={audit.leads.companyMatchesAccount} />
          <Stat label="Company has no Account match" value={audit.leads.companyNoAccountMatch} />
          <Stat label="accountId null" value={audit.leads.accountIdNull} />
          <Stat label="primaryContactId null" value={audit.leads.primaryContactIdNull} />
          <Stat label="Duplicate candidates" value={audit.leads.duplicateCandidates.length} flag />
          <Stat label="Qualified, no Opportunity" value={audit.leads.qualifiedNoOpportunity.length} flag />
          <Stat label="Qualified, no open Task" value={audit.leads.qualifiedNoOpenTask.length} flag />
        </Section>

        <Section title="Opportunities">
          <div className="grid grid-cols-2 gap-4 mb-3">
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-1">Stage</p>
              <Distribution data={audit.opportunities.stageDistribution} />
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-1">Type</p>
              <Distribution data={audit.opportunities.typeDistribution} />
            </div>
          </div>
          <Stat label="No OpportunityContact rows" value={audit.opportunities.noContacts.length} flag />
          <Stat label="No primary contact" value={audit.opportunities.noPrimaryContact.length} flag />
          <Stat label="No Activity" value={audit.opportunities.noActivity.length} flag />
          <Stat label="No open Task" value={audit.opportunities.noOpenTask.length} flag />
          <Stat label="$0 / unknown value" value={audit.opportunities.zeroOrUnknownValue.length} />
        </Section>

        <Section title="Tasks">
          <Distribution data={audit.tasks.statusDistribution} />
          <div className="mt-2">
            <Stat label="No due date" value={audit.tasks.noDueDate} />
            <Stat label="Overdue" value={audit.tasks.overdue} flag />
            <Stat label="Orphan (no linked record)" value={audit.tasks.orphan.length} flag />
          </div>
        </Section>

        <Section title="Activities">
          <Stat label="Total" value={audit.activities.total} />
          <div className="my-2">
            <p className="text-xs font-semibold text-gray-500 mb-1">Type</p>
            <Distribution data={audit.activities.typeDistribution} />
          </div>
          <Stat label="Orphan (no linked record)" value={audit.activities.orphan.length} flag />
          <Stat label="Accounts with no activity" value={audit.activities.accountsWithNoActivity} />
          <Stat label="Contacts with no activity" value={audit.activities.contactsWithNoActivity} />
          <Stat label="Opportunities with no activity" value={audit.activities.opportunitiesWithNoActivity} />
        </Section>
      </div>

      <div className="mt-6">
        <Sprint03Panel />
      </div>

      <div className="mt-6">
        <Sprint04Panel />
      </div>

      <div className="mt-6">
        <Sprint05Panel />
      </div>

      <div className="mt-6">
        <Sprint05ExecutePanel />
      </div>

      <div className="mt-6">
        <Section title={`Travelport Check (Andy / Adrian / Travelport) — ${travelportTotal} matches, analysis only`}>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-1">Contacts</p>
              <IdList items={audit.travelport.contacts} />
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-1">Leads</p>
              <IdList items={audit.travelport.leads} />
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-1">Accounts</p>
              <IdList items={audit.travelport.accounts} />
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-1">Opportunities</p>
              <IdList items={audit.travelport.opportunities} />
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-1">Activities</p>
              <IdList items={audit.travelport.activities} />
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-1">Tasks</p>
              <IdList items={audit.travelport.tasks} />
            </div>
          </div>
        </Section>
      </div>
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  ACCOUNT_TIERS,
  COMPANY_SIZES,
  CONTACT_ROLES,
  GCC_COUNTRIES,
  LEAD_STATUS_COLORS_WITH_CONVERTED,
  LEAD_STATUS_LABELS_WITH_CONVERTED,
  RELATIONSHIP_STRENGTH_COLORS,
  RELATIONSHIP_STRENGTHS,
  SECTORS,
  displayLeadStatus,
  stageColor,
} from "@/lib/constants";
import { fmtDateYear, fmtMoney } from "@/lib/format";
import { deriveLastInteraction } from "@/lib/nextInteraction";
import { summarizeOpenOpportunityPipeline } from "@/lib/crmHealth";
import {
  buildProductEvidence,
  buildRelationshipTimeline,
  type LegacyNextActionRef,
  type RelationshipTaskRef,
} from "@/lib/relationshipMemory";
import ProductBadge from "@/components/ProductBadge";
import { RelationshipTimeline } from "@/components/Timeline";
import RelationshipActions from "@/components/RelationshipActions";

async function getAccountMemory(id: string) {
  const account = await prisma.account.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, name: true } },
      contacts: {
        include: {
          opportunities: {
            where: { opportunity: { accountId: id } },
            include: { opportunity: { select: { id: true, name: true } } },
          },
        },
        orderBy: [{ relationshipStrength: "desc" }, { createdAt: "asc" }],
      },
      leads: {
        include: { primaryContact: { select: { id: true, firstName: true, lastName: true } } },
        orderBy: { updatedAt: "desc" },
      },
      opportunities: {
        include: {
          stageRef: true,
          contacts: { include: { contact: { select: { id: true, firstName: true, lastName: true } } } },
        },
        orderBy: { updatedAt: "desc" },
      },
      accountProducts: { include: { product: true }, orderBy: { product: { displayOrder: "asc" } } },
    },
  });
  if (!account) return null;

  const [activities, tasks, meetings, proposals] = await Promise.all([
    prisma.activity.findMany({
      where: {
        OR: [
          { accountId: id },
          { contact: { accountId: id } },
          { lead: { accountId: id } },
          { opportunity: { accountId: id } },
        ],
      },
      include: {
        contact: { select: { id: true, firstName: true, lastName: true } },
        lead: { select: { id: true, name: true, primaryProduct: true } },
        opportunity: { select: { id: true, name: true, product: true } },
      },
      orderBy: { date: "desc" },
    }),
    prisma.task.findMany({
      where: {
        OR: [
          { accountId: id },
          { contact: { accountId: id } },
          { lead: { accountId: id } },
          { opportunity: { accountId: id } },
        ],
      },
      include: {
        contact: { select: { id: true, firstName: true, lastName: true } },
        lead: { select: { id: true, name: true, primaryProduct: true } },
        opportunity: { select: { id: true, name: true, product: true } },
      },
      orderBy: [{ status: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
    }),
    prisma.meetingTranscript.findMany({
      where: {
        OR: [
          { accountId: id },
          { contact: { accountId: id } },
          { lead: { accountId: id } },
        ],
      },
      include: {
        contact: { select: { id: true, firstName: true, lastName: true } },
        lead: { select: { id: true, name: true } },
      },
      orderBy: { meetingDate: "desc" },
    }),
    prisma.proposal.findMany({
      where: { OR: [{ accountId: id }, { opportunity: { accountId: id } }] },
      include: { opportunity: { select: { id: true, name: true } }, transcript: { select: { id: true, title: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return { account, activities, tasks, meetings, proposals };
}

function words(value: string) {
  return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default async function AccountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const memory = await getAccountMemory(id);
  if (!memory) notFound();
  const { account, activities, tasks, meetings, proposals } = memory;

  const productEvidence = buildProductEvidence({
    accountProducts: account.accountProducts.map((item) => ({ productKey: item.productKey, relationshipState: item.relationshipState })),
    leads: account.leads,
    opportunities: account.opportunities,
    activities,
    tasks,
    meetings,
    proposals,
  });
  const timeline = buildRelationshipTimeline({
    activities: activities.map((activity) => ({
      ...activity,
      href: "/activities",
      provenance: activity.accountId === account.id
        ? "Activity directly linked to this Account"
        : activity.opportunity
          ? `Derived through Opportunity: ${activity.opportunity.name}`
          : activity.lead
            ? `Derived through Lead: ${activity.lead.name}`
            : activity.contact
              ? `Derived through Contact: ${activity.contact.firstName} ${activity.contact.lastName}`
              : "Linked Activity",
      product: activity.opportunity?.product ?? activity.lead?.primaryProduct ?? activity.product,
    })),
    meetings: meetings.map((meeting) => ({
      ...meeting,
      href: "/meetings",
      provenance: meeting.accountId === account.id
        ? "Meeting directly linked to this Account"
        : meeting.lead
          ? `Derived through Lead: ${meeting.lead.name}`
          : meeting.contact
            ? `Derived through Contact: ${meeting.contact.firstName} ${meeting.contact.lastName}`
            : "Linked Meeting",
      product: meeting.detectedProduct,
    })),
    proposals: proposals.map((proposal) => ({
      ...proposal,
      href: `/proposals/${proposal.id}`,
      provenance: proposal.accountId === account.id
        ? "Proposal directly linked to this Account"
        : proposal.opportunity
          ? `Derived through Opportunity: ${proposal.opportunity.name}`
          : "Linked Proposal",
    })),
  });

  const relationshipTasks: RelationshipTaskRef[] = tasks.map((task) => ({
    ...task,
    href: task.opportunity
      ? `/opportunities/${task.opportunity.id}`
      : task.lead
        ? `/leads/${task.lead.id}`
        : task.contact
          ? `/contacts/${task.contact.id}`
          : `/accounts/${account.id}`,
    provenance: task.accountId === account.id
      ? "Task directly linked to this Account"
      : task.opportunity
        ? `Derived through Opportunity: ${task.opportunity.name}`
        : task.lead
          ? `Derived through Lead: ${task.lead.name}`
          : task.contact
            ? `Derived through Contact: ${task.contact.firstName} ${task.contact.lastName}`
            : "Linked Task",
  }));
  const legacyCandidates: LegacyNextActionRef[] = [
    ...account.leads.map((lead) => ({
      label: lead.nextAction,
      date: lead.nextActionDate,
      href: `/leads/${lead.id}`,
      provenance: `Legacy next-action summary on Lead: ${lead.name}`,
    })),
    ...account.opportunities.map((opportunity) => ({
      label: opportunity.nextAction,
      date: opportunity.nextActionDate,
      href: `/opportunities/${opportunity.id}`,
      provenance: `Legacy next-action summary on Opportunity: ${opportunity.name}`,
    })),
  ];
  const latest = deriveLastInteraction(activities);
  const { openDealCount, pipelineValue } = summarizeOpenOpportunityPipeline(account.opportunities);
  const historyGaps = [
    activities.length === 0 ? "No Activities document this relationship; engagement history may exist outside the CRM." : null,
    account.contacts.length === 0 ? "No Contacts are linked to this Account." : null,
    account.leads.length > 0 && activities.length < account.leads.length ? `${account.leads.length} Leads are linked but only ${activities.length} Activities document relationship history.` : null,
    productEvidence.length > 0 && account.accountProducts.length === 0 ? "Product interest is derived from linked records, but no Account Product relationship state is recorded." : null,
  ].filter(Boolean) as string[];

  return (
    <div className="p-5 md:p-8">
      <Link href="/accounts" className="text-sm text-gray-500 hover:text-gray-700">← Accounts</Link>

      <header className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-950">{account.name}</h1>
            {account.tier && <span className="badge bg-gray-100 text-gray-700">{ACCOUNT_TIERS[account.tier] ?? account.tier}</span>}
          </div>
          <p className="mt-1 text-sm text-gray-500">
            {GCC_COUNTRIES[account.country] ?? account.country} · {SECTORS[account.sector] ?? account.sector}
            {account.industry ? ` · ${account.industry}` : " · Industry not recorded"}
          </p>
          <p className="mt-1 text-xs text-gray-400">Owner: {account.owner?.name ?? "Not assigned"}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/activities/new?accountId=${account.id}`} className="btn-secondary">Log Activity</Link>
          <Link href={`/tasks/new?accountId=${account.id}`} className="btn-secondary">Add Task</Link>
          <Link href={`/opportunities/new?accountId=${account.id}`} className="btn-secondary">Open Opportunity</Link>
          <Link href={`/accounts/${account.id}/edit`} className="btn-primary">Edit Account</Link>
        </div>
      </header>

      <section className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-5" aria-label="Relationship summary">
        {[
          ["Contacts", account.contacts.length], ["Leads", account.leads.length], ["Open deals", openDealCount],
          ["Activities", activities.length], ["Pipeline", fmtMoney(pipelineValue)],
        ].map(([label, value]) => (
          <div key={label} className="card p-4"><p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">{label}</p><p className="mt-1 text-xl font-bold text-gray-900">{value}</p></div>
        ))}
      </section>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <section className="card p-5 xl:col-span-2">
          <h2 className="text-sm font-semibold text-gray-800">Company context</h2>
          <dl className="mt-4 grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
            <div><dt className="text-xs text-gray-400">Description</dt><dd className="mt-1 text-gray-700">{account.description ?? "Not recorded"}</dd></div>
            <div><dt className="text-xs text-gray-400">Past ArqOne engagements</dt><dd className="mt-1 text-gray-700">{account.pastEngagements ?? "Not recorded"}</dd></div>
            <div><dt className="text-xs text-gray-400">Company size</dt><dd className="mt-1 text-gray-700">{account.size ? (COMPANY_SIZES[account.size] ?? account.size) : "Not recorded"}</dd></div>
            <div><dt className="text-xs text-gray-400">Locations</dt><dd className="mt-1 text-gray-700">{account.locationsCount ?? "Not recorded"}</dd></div>
            <div><dt className="text-xs text-gray-400">Website</dt><dd className="mt-1 text-gray-700">{account.website ? <a href={account.website} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline">{account.website}</a> : "Not recorded"}</dd></div>
            <div><dt className="text-xs text-gray-400">Latest recorded Activity</dt><dd className="mt-1 text-gray-700">{latest ? `${latest.label} · ${fmtDateYear(latest.date)}` : "No Activity recorded"}</dd></div>
          </dl>
        </section>

        <section className="card p-5">
          <h2 className="text-sm font-semibold text-gray-800">History completeness</h2>
          {historyGaps.length === 0 ? <p className="mt-3 text-sm text-emerald-700">No relationship-memory gaps detected from linked records.</p> : (
            <ul className="mt-3 space-y-2">{historyGaps.map((gap) => <li key={gap} className="rounded-lg bg-amber-50 p-2.5 text-xs text-amber-900">Review only · {gap}</li>)}</ul>
          )}
          <Link href={`/activities/new?accountId=${account.id}`} className="mt-3 inline-block text-xs font-semibold text-brand-600 hover:underline">Enrich history manually</Link>
        </section>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section className="card p-5">
          <div className="flex items-center justify-between"><h2 className="text-sm font-semibold text-gray-800">People and roles</h2><Link href={`/contacts/new?accountId=${account.id}`} className="text-xs font-semibold text-brand-600">Add Contact</Link></div>
          {account.contacts.length === 0 ? <p className="mt-4 text-sm text-gray-400">No Contacts are linked.</p> : (
            <div className="mt-4 space-y-3">{account.contacts.map((contact) => (
              <article key={contact.id} className="rounded-lg border border-gray-100 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div><Link href={`/contacts/${contact.id}`} className="text-sm font-semibold text-brand-700 hover:underline">{contact.firstName} {contact.lastName}</Link><p className="text-xs text-gray-500">{contact.title ?? "Job title not recorded"}</p></div>
                  <div className="flex flex-wrap gap-1.5">
                    <span className="badge bg-purple-100 text-purple-700">{contact.role ? (CONTACT_ROLES[contact.role] ?? contact.role) : "Buying role unknown"}</span>
                    <span className={`badge ${contact.relationshipStrength ? (RELATIONSHIP_STRENGTH_COLORS[contact.relationshipStrength] ?? "bg-gray-100 text-gray-600") : "bg-gray-100 text-gray-500"}`}>{contact.relationshipStrength ? (RELATIONSHIP_STRENGTHS[contact.relationshipStrength] ?? contact.relationshipStrength) : "Relationship unknown"}</span>
                  </div>
                </div>
                {contact.opportunities.length > 0 && (
                  <div className="mt-2 space-y-0.5 text-[11px] text-gray-400">
                    {contact.opportunities.map((item) => (
                      <p key={item.opportunityId}>
                        Opportunity: {item.opportunity.name}
                        {item.isPrimary ? " · Primary Contact" : ""}
                        {item.stakeholderRole ? ` · ${item.stakeholderRole}` : " · Stakeholder role not recorded"}
                      </p>
                    ))}
                  </div>
                )}
              </article>
            ))}</div>
          )}
        </section>

        <section className="card p-5">
          <h2 className="text-sm font-semibold text-gray-800">Products in the relationship record</h2>
          <p className="mt-1 text-xs text-gray-500">Account Product states are recorded facts; other product links are derived from existing records.</p>
          {productEvidence.length === 0 ? <p className="mt-4 text-sm text-gray-400">No product assignment or linked product evidence.</p> : (
            <div className="mt-4 space-y-3">{productEvidence.map((product) => (
              <article key={product.key} className="rounded-lg border border-gray-100 p-3">
                <div className="flex flex-wrap items-center gap-2"><ProductBadge product={product.key} />{product.recordedRelationship && <span className="text-xs font-semibold text-emerald-700">Recorded state: {words(product.recordedRelationship)}</span>}</div>
                <p className="mt-1 text-[11px] text-gray-400">Evidence: {product.sources.join(" · ")}</p>
              </article>
            ))}</div>
          )}
        </section>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section className="card p-5">
          <h2 className="text-sm font-semibold text-gray-800">Leads</h2>
          {account.leads.length === 0 ? <p className="mt-4 text-sm text-gray-400">No Leads are linked.</p> : <div className="mt-4 space-y-2">{account.leads.map((lead) => {
            const status = displayLeadStatus(lead);
            return <Link key={lead.id} href={`/leads/${lead.id}`} className="flex items-center justify-between rounded-lg border border-gray-100 p-3 hover:border-brand-200"><div><p className="text-sm font-medium text-gray-900">{lead.name}</p><p className="text-xs text-gray-400">Primary Contact: {lead.primaryContact ? `${lead.primaryContact.firstName} ${lead.primaryContact.lastName}` : "Not linked"} · Source: {lead.sourceDetail ?? lead.sourceType ?? "Unknown"}</p></div><div className="flex items-center gap-2"><ProductBadge product={lead.primaryProduct} /><span className={`badge ${LEAD_STATUS_COLORS_WITH_CONVERTED[status] ?? "bg-gray-100 text-gray-600"}`}>{LEAD_STATUS_LABELS_WITH_CONVERTED[status] ?? status}</span></div></Link>;
          })}</div>}
        </section>

        <section className="card p-5">
          <h2 className="text-sm font-semibold text-gray-800">Opportunities</h2>
          {account.opportunities.length === 0 ? <p className="mt-4 text-sm text-gray-400">No Opportunities are linked.</p> : <div className="mt-4 space-y-2">{account.opportunities.map((opportunity) => (
            <Link key={opportunity.id} href={`/opportunities/${opportunity.id}`} className="flex items-center justify-between rounded-lg border border-gray-100 p-3 hover:border-brand-200"><div><p className="text-sm font-medium text-gray-900">{opportunity.name}</p><p className="text-xs text-gray-400">{opportunity.contacts.length} stakeholder{opportunity.contacts.length === 1 ? "" : "s"} · Expected close: {opportunity.expectedCloseDate ? fmtDateYear(opportunity.expectedCloseDate) : "Not recorded"}</p></div><div className="flex items-center gap-2"><ProductBadge product={opportunity.product} /><span className={`badge ${stageColor(opportunity.stage)}`}>{opportunity.stageRef?.name ?? opportunity.stage}</span></div></Link>
          ))}</div>}
        </section>
      </div>

      <section className="card mt-6 p-5">
        <h2 className="text-sm font-semibold text-gray-800">Commitments and actions</h2>
        <p className="mt-1 text-xs text-gray-500">Canonical Tasks take precedence. Internal targets and client-agreed dates remain separate.</p>
        <div className="mt-4"><RelationshipActions tasks={relationshipTasks} legacyCandidates={legacyCandidates} addTaskHref={`/tasks/new?accountId=${account.id}`} /></div>
      </section>

      <section className="card mt-6 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-sm font-semibold text-gray-800">Unified relationship timeline</h2><p className="mt-1 text-xs text-gray-500">{activities.length} Activities · {meetings.length} Meetings · {proposals.length} Proposals. Source records remain distinct.</p></div><Link href={`/activities/new?accountId=${account.id}`} className="text-xs font-semibold text-brand-600">Log Activity</Link></div>
        <div className="mt-4"><RelationshipTimeline entries={timeline} /></div>
      </section>
    </div>
  );
}

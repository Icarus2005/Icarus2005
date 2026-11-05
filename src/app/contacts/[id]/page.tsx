import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  ACQUISITION_PATHS,
  CONTACT_ROLES,
  LEAD_SOURCE_TYPES,
  LEAD_STATUS_COLORS_WITH_CONVERTED,
  LEAD_STATUS_LABELS_WITH_CONVERTED,
  RELATIONSHIP_STRENGTH_COLORS,
  RELATIONSHIP_STRENGTHS,
  displayLeadStatus,
  stageColor,
} from "@/lib/constants";
import { fmtDateYear } from "@/lib/format";
import { deriveLastInteraction } from "@/lib/nextInteraction";
import {
  buildProductEvidence,
  buildRelationshipTimeline,
  type LegacyNextActionRef,
  type RelationshipTaskRef,
} from "@/lib/relationshipMemory";
import ProductBadge from "@/components/ProductBadge";
import { RelationshipTimeline } from "@/components/Timeline";
import RelationshipActions from "@/components/RelationshipActions";
import SalesCopilotPanel from "@/components/SalesCopilotPanel";

async function getContactMemory(id: string) {
  const contact = await prisma.contact.findUnique({
    where: { id },
    include: {
      account: true,
      referredBy: { select: { id: true, firstName: true, lastName: true } },
      referrals: { select: { id: true, firstName: true, lastName: true } },
      leadsAsPrimaryContact: { orderBy: { updatedAt: "desc" } },
      opportunities: {
        include: { opportunity: { include: { stageRef: true, account: { select: { id: true, name: true } } } } },
      },
    },
  });
  if (!contact) return null;

  const [activities, tasks, meetings, proposals] = await Promise.all([
    prisma.activity.findMany({
      where: { contactId: id },
      include: {
        lead: { select: { id: true, name: true, primaryProduct: true } },
        opportunity: { select: { id: true, name: true, product: true } },
      },
      orderBy: { date: "desc" },
    }),
    prisma.task.findMany({
      where: {
        OR: [
          { contactId: id },
          { lead: { primaryContactId: id } },
          { opportunity: { contacts: { some: { contactId: id } } } },
        ],
      },
      include: {
        lead: { select: { id: true, name: true, primaryProduct: true, primaryContactId: true } },
        opportunity: { select: { id: true, name: true, product: true } },
      },
      orderBy: [{ status: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
    }),
    prisma.meetingTranscript.findMany({ where: { contactId: id }, orderBy: { meetingDate: "desc" } }),
    prisma.proposal.findMany({
      where: { transcript: { contactId: id } },
      include: { transcript: { select: { id: true, title: true } }, opportunity: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  return { contact, activities, tasks, meetings, proposals };
}

export default async function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const memory = await getContactMemory(id);
  if (!memory) notFound();
  const { contact, activities, tasks, meetings, proposals } = memory;
  const linkedOpportunities = contact.opportunities.map((item) => item.opportunity);

  const productEvidence = buildProductEvidence({
    leads: contact.leadsAsPrimaryContact,
    opportunities: linkedOpportunities,
    activities,
    tasks,
    meetings,
    proposals,
  });
  const timeline = buildRelationshipTimeline({
    activities: activities.map((activity) => ({
      ...activity,
      href: "/activities",
      provenance: "Activity directly linked to this Contact",
      product: activity.opportunity?.product ?? activity.lead?.primaryProduct ?? activity.product,
    })),
    meetings: meetings.map((meeting) => ({
      ...meeting,
      href: "/meetings",
      provenance: "Meeting directly linked to this Contact",
      product: meeting.detectedProduct,
    })),
    proposals: proposals.map((proposal) => ({
      ...proposal,
      href: `/proposals/${proposal.id}`,
      provenance: proposal.transcript ? `Linked through Meeting: ${proposal.transcript.title}` : "Linked Proposal",
    })),
  });
  const relationshipTasks: RelationshipTaskRef[] = tasks.map((task) => ({
    ...task,
    href: task.opportunity
      ? `/opportunities/${task.opportunity.id}`
      : task.lead
        ? `/leads/${task.lead.id}`
        : `/contacts/${contact.id}`,
    provenance: task.contactId === contact.id
      ? "Task directly linked to this Contact"
      : task.opportunity
        ? `Derived through stakeholder link to Opportunity: ${task.opportunity.name}`
        : task.lead
          ? `Derived through primary-Contact link to Lead: ${task.lead.name}`
          : "Linked Task",
  }));
  const legacyCandidates: LegacyNextActionRef[] = [
    ...contact.leadsAsPrimaryContact.map((lead) => ({
      label: lead.nextAction,
      date: lead.nextActionDate,
      href: `/leads/${lead.id}`,
      provenance: `Legacy next-action summary on Lead: ${lead.name}`,
    })),
    ...linkedOpportunities.map((opportunity) => ({
      label: opportunity.nextAction,
      date: opportunity.nextActionDate,
      href: `/opportunities/${opportunity.id}`,
      provenance: `Legacy next-action summary on Opportunity: ${opportunity.name}`,
    })),
  ];
  const latest = deriveLastInteraction(activities);
  const historyGaps = [
    activities.length === 0 ? "No Activities are directly linked to this Contact; engagement history may be undocumented." : null,
    !contact.relationshipStrength ? "Relationship strength is unknown." : null,
    !contact.role ? "Buying role is unknown." : null,
    !contact.sourceType && !contact.acquisitionPath ? "Relationship provenance is not recorded." : null,
    contact.leadsAsPrimaryContact.length > 0 && activities.length === 0 ? `${contact.leadsAsPrimaryContact.length} linked Lead${contact.leadsAsPrimaryContact.length === 1 ? " has" : "s have"} no Contact-linked Activity history.` : null,
  ].filter(Boolean) as string[];

  return (
    <div className="p-5 md:p-8">
      <Link href="/contacts" className="text-sm text-gray-500 hover:text-gray-700">← Contacts</Link>

      <header className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-950">{contact.firstName} {contact.lastName}</h1>
            <span className={`badge ${contact.relationshipStrength ? (RELATIONSHIP_STRENGTH_COLORS[contact.relationshipStrength] ?? "bg-gray-100 text-gray-600") : "bg-gray-100 text-gray-500"}`}>
              {contact.relationshipStrength ? (RELATIONSHIP_STRENGTHS[contact.relationshipStrength] ?? contact.relationshipStrength) : "Relationship unknown"}
            </span>
            <span className="badge bg-purple-100 text-purple-700">{contact.role ? (CONTACT_ROLES[contact.role] ?? contact.role) : "Buying role unknown"}</span>
          </div>
          <p className="mt-1 text-sm text-gray-600">{contact.title ?? "Job title not recorded"}</p>
          <Link href={`/accounts/${contact.account.id}`} className="mt-1 inline-block text-sm font-medium text-brand-600 hover:underline">{contact.account.name}</Link>
          <div className="mt-2 flex flex-wrap gap-3 text-sm text-gray-500">
            <span>{contact.email ?? "Email not recorded"}</span><span>{contact.phone ?? "Phone not recorded"}</span>
            {contact.linkedin && <a href={contact.linkedin} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline">LinkedIn ↗</a>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/activities/new?contactId=${contact.id}&accountId=${contact.accountId}`} className="btn-secondary">Log Activity</Link>
          <Link href={`/tasks/new?contactId=${contact.id}&accountId=${contact.accountId}`} className="btn-secondary">Add Task</Link>
          <Link href={`/opportunities/new?accountId=${contact.accountId}`} className="btn-secondary">Open Opportunity</Link>
          <Link href={`/contacts/${contact.id}/edit`} className="btn-primary">Edit relationship</Link>
        </div>
      </header>

      <section className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-5" aria-label="Relationship summary">
        {[
          ["Leads", contact.leadsAsPrimaryContact.length], ["Opportunities", linkedOpportunities.length], ["Activities", activities.length],
          ["Open Tasks", tasks.filter((task) => task.status === "OPEN").length], ["Latest Activity", latest ? fmtDateYear(latest.date) : "Not recorded"],
        ].map(([label, value]) => <div key={label} className="card p-4"><p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">{label}</p><p className="mt-1 text-lg font-bold text-gray-900">{value}</p></div>)}
      </section>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <section className="card p-5 xl:col-span-2">
          <div className="flex items-center justify-between"><div><h2 className="text-sm font-semibold text-gray-800">Recorded relationship facts</h2><p className="mt-1 text-xs text-gray-500">User-recorded fields only; no relationship state is inferred.</p></div><Link href={`/contacts/${contact.id}/edit`} className="text-xs font-semibold text-brand-600">Edit</Link></div>
          <dl className="mt-4 grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
            <div><dt className="text-xs text-gray-400">Relationship strength / connector status</dt><dd className="mt-1 text-gray-700">{contact.relationshipStrength ? (RELATIONSHIP_STRENGTHS[contact.relationshipStrength] ?? contact.relationshipStrength) : "Unknown"}</dd></div>
            <div><dt className="text-xs text-gray-400">Buying role / champion status</dt><dd className="mt-1 text-gray-700">{contact.role ? (CONTACT_ROLES[contact.role] ?? contact.role) : "Unknown"}</dd></div>
            <div><dt className="text-xs text-gray-400">Source</dt><dd className="mt-1 text-gray-700">{contact.sourceType ? (LEAD_SOURCE_TYPES[contact.sourceType] ?? contact.sourceType) : "Unknown"}{contact.sourceDetail ? ` · ${contact.sourceDetail}` : ""}</dd></div>
            <div><dt className="text-xs text-gray-400">Acquisition path</dt><dd className="mt-1 text-gray-700">{contact.acquisitionPath ? (ACQUISITION_PATHS[contact.acquisitionPath] ?? contact.acquisitionPath) : "Unknown"}</dd></div>
            <div><dt className="text-xs text-gray-400">Referred by</dt><dd className="mt-1 text-gray-700">{contact.referredBy ? <Link href={`/contacts/${contact.referredBy.id}`} className="text-brand-600 hover:underline">{contact.referredBy.firstName} {contact.referredBy.lastName}</Link> : "Not recorded"}</dd></div>
            <div><dt className="text-xs text-gray-400">Introductions / referrals made</dt><dd className="mt-1 text-gray-700">{contact.referrals.length > 0 ? contact.referrals.map((item) => <Link key={item.id} href={`/contacts/${item.id}`} className="mr-2 text-brand-600 hover:underline">{item.firstName} {item.lastName}</Link>) : "None recorded"}</dd></div>
          </dl>
        </section>

        <section className="card p-5">
          <h2 className="text-sm font-semibold text-gray-800">History completeness</h2>
          {historyGaps.length === 0 ? <p className="mt-3 text-sm text-emerald-700">No relationship-memory gaps detected from linked records.</p> : <ul className="mt-3 space-y-2">{historyGaps.map((gap) => <li key={gap} className="rounded-lg bg-amber-50 p-2.5 text-xs text-amber-900">Review only · {gap}</li>)}</ul>}
          <Link href={`/activities/new?contactId=${contact.id}&accountId=${contact.accountId}`} className="mt-3 inline-block text-xs font-semibold text-brand-600 hover:underline">Enrich history manually</Link>
        </section>
      </div>

      <section className="card mt-6 p-5">
        <h2 className="text-sm font-semibold text-gray-800">Products linked to this relationship</h2>
        <p className="mt-1 text-xs text-gray-500">Derived from linked Leads, Opportunities, Activities, Tasks, Meetings and Proposals; not asserted as personal interest without a source record.</p>
        {productEvidence.length === 0 ? <p className="mt-4 text-sm text-gray-400">No product evidence is linked.</p> : <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">{productEvidence.map((product) => <article key={product.key} className="rounded-lg border border-gray-100 p-3"><ProductBadge product={product.key} /><p className="mt-1 text-[11px] text-gray-400">Derived from: {product.sources.join(" · ")}</p></article>)}</div>}
      </section>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section className="card p-5">
          <h2 className="text-sm font-semibold text-gray-800">Associated Leads</h2>
          {contact.leadsAsPrimaryContact.length === 0 ? <p className="mt-4 text-sm text-gray-400">Not the recorded primary Contact on any Lead.</p> : <div className="mt-4 space-y-2">{contact.leadsAsPrimaryContact.map((lead) => {
            const status = displayLeadStatus(lead);
            return <Link key={lead.id} href={`/leads/${lead.id}`} className="flex items-center justify-between rounded-lg border border-gray-100 p-3 hover:border-brand-200"><div><p className="text-sm font-medium text-gray-900">{lead.name}</p><p className="text-xs text-gray-400">Source: {lead.sourceDetail ?? lead.sourceType ?? "Unknown"}</p></div><div className="flex items-center gap-2"><ProductBadge product={lead.primaryProduct} /><span className={`badge ${LEAD_STATUS_COLORS_WITH_CONVERTED[status] ?? "bg-gray-100 text-gray-600"}`}>{LEAD_STATUS_LABELS_WITH_CONVERTED[status] ?? status}</span></div></Link>;
          })}</div>}
        </section>

        <section className="card p-5">
          <h2 className="text-sm font-semibold text-gray-800">Opportunity stakeholder links</h2>
          {contact.opportunities.length === 0 ? <p className="mt-4 text-sm text-gray-400">Not linked as a stakeholder on any Opportunity.</p> : <div className="mt-4 space-y-2">{contact.opportunities.map(({ opportunity, isPrimary, stakeholderRole }) => <Link key={opportunity.id} href={`/opportunities/${opportunity.id}`} className="flex items-center justify-between rounded-lg border border-gray-100 p-3 hover:border-brand-200"><div><p className="text-sm font-medium text-gray-900">{opportunity.name}</p><p className="text-xs text-gray-400">{isPrimary ? "Primary Opportunity Contact" : "Stakeholder"} · {stakeholderRole ?? "Stakeholder role not recorded"}</p></div><div className="flex items-center gap-2"><ProductBadge product={opportunity.product} /><span className={`badge ${stageColor(opportunity.stage)}`}>{opportunity.stageRef?.name ?? opportunity.stage}</span></div></Link>)}</div>}
        </section>
      </div>

      <section className="card mt-6 p-5">
        <h2 className="text-sm font-semibold text-gray-800">Commitments and actions</h2>
        <p className="mt-1 text-xs text-gray-500">Direct Tasks and Tasks derived through primary-Lead or Opportunity stakeholder links are labelled separately.</p>
        <div className="mt-4"><RelationshipActions tasks={relationshipTasks} legacyCandidates={legacyCandidates} addTaskHref={`/tasks/new?contactId=${contact.id}&accountId=${contact.accountId}`} /></div>
      </section>

      <section className="card mt-6 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-sm font-semibold text-gray-800">Unified relationship timeline</h2><p className="mt-1 text-xs text-gray-500">Only directly linked Contact Activities and Meetings are shown. Proposal links require a Contact-linked Meeting.</p></div><Link href={`/activities/new?contactId=${contact.id}&accountId=${contact.accountId}`} className="text-xs font-semibold text-brand-600">Log Activity</Link></div>
        <div className="mt-4"><RelationshipTimeline entries={timeline} /></div>
      </section>

      <div className="mt-6"><SalesCopilotPanel entityType="CONTACT" entityId={contact.id} relatedIds={{ contactId: contact.id, accountId: contact.accountId }} /></div>
    </div>
  );
}

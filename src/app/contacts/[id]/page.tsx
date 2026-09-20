import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { CONTACT_ROLES, stageColor } from "@/lib/constants";
import ProductBadge from "@/components/ProductBadge";
import Timeline from "@/components/Timeline";

async function getContact(id: string) {
  return prisma.contact.findUnique({
    where: { id },
    include: {
      account: true,
      opportunities: { include: { opportunity: { include: { stageRef: true } } } },
      activities: { orderBy: { date: "desc" }, take: 20 },
    },
  });
}

export default async function ContactDetailPage({ params }: { params: { id: string } }) {
  const contact = await getContact(params.id);
  if (!contact) notFound();

  return (
    <div className="p-8">
      <div className="mb-6">
        <Link href="/contacts" className="text-sm text-gray-500 hover:text-gray-700">← Contacts</Link>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {contact.firstName} {contact.lastName}
          </h1>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            {contact.title && <span className="text-sm text-gray-600">{contact.title}</span>}
            {contact.role && (
              <span className="badge bg-purple-100 text-purple-700">
                {CONTACT_ROLES[contact.role] ?? contact.role}
              </span>
            )}
          </div>
          {contact.account && (
            <Link
              href={`/accounts/${contact.account.id}`}
              className="text-sm text-brand-600 hover:underline mt-1 inline-block"
            >
              {contact.account.name}
            </Link>
          )}
          <div className="flex gap-4 mt-2">
            {contact.email && (
              <a href={`mailto:${contact.email}`} className="text-sm text-gray-500 hover:text-brand-600">
                {contact.email}
              </a>
            )}
            {contact.phone && (
              <a href={`tel:${contact.phone}`} className="text-sm text-gray-500 hover:text-brand-600">
                {contact.phone}
              </a>
            )}
            {contact.linkedin && (
              <a
                href={contact.linkedin}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-brand-600 hover:underline"
              >
                LinkedIn ↗
              </a>
            )}
          </div>
        </div>
        <Link href={`/contacts/${contact.id}/edit`} className="btn-secondary">Edit</Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Linked Opportunities */}
        <div className="card p-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Opportunities</h2>
          {contact.opportunities.length === 0 && (
            <p className="text-sm text-gray-400">Not linked to any opportunities.</p>
          )}
          <div className="space-y-3">
            {contact.opportunities.map(({ opportunity: opp }) => (
              <div key={opp.id} className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <Link href={`/opportunities/${opp.id}`} className="text-sm font-medium text-brand-600 hover:underline">
                    {opp.name}
                  </Link>
                  <div className="mt-0.5"><ProductBadge product={opp.product} /></div>
                </div>
                <span className={`badge shrink-0 ${stageColor(opp.stage)}`}>
                  {opp.stageRef?.name ?? opp.stage}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Activity Feed */}
        <div className="card p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-sm font-semibold text-gray-700">Activity</h2>
            <Link
              href={`/activities/new?contactId=${contact.id}&accountId=${contact.accountId}`}
              className="text-xs text-brand-600 hover:underline"
            >
              + Log
            </Link>
          </div>
          <Timeline activities={contact.activities} />
        </div>
      </div>
    </div>
  );
}

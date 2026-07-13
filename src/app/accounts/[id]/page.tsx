import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  GCC_COUNTRIES, SECTORS, COMPANY_SIZES, CONTACT_ROLES,
  ACCOUNT_TIERS, ACTIVITY_TYPES, stageColor,
} from "@/lib/constants";
import { ALL_PRODUCT_KEYS, PRODUCTS_META } from "@/lib/products";
import { fmtMoney as fmt } from "@/lib/format";
import ProductBadge from "@/components/ProductBadge";

async function getAccount(id: string) {
  return prisma.account.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, name: true } },
      contacts: { orderBy: { createdAt: "asc" } },
      opportunities: { include: { stageRef: true }, orderBy: { updatedAt: "desc" } },
      activities: {
        include: { contact: true, opportunity: true },
        orderBy: { date: "desc" },
        take: 20,
      },
    },
  });
}

export default async function AccountDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const account = await getAccount(params.id);
  if (!account) notFound();

  const openDeals = account.opportunities.filter((o) => !o.closedAt);
  const pipelineValue = openDeals.reduce((s, o) => s + (o.value ?? 0), 0);
  const activeProducts = Array.from(new Set(openDeals.map((o) => o.product))).filter(
    (p) => p !== "UNASSIGNED"
  );
  // Group ALL opportunities by product for the product-grouped panel
  const productGroups = ALL_PRODUCT_KEYS.map((key) => ({
    key,
    opps: account.opportunities.filter((o) => o.product === key),
  })).filter((g) => g.opps.length > 0);

  return (
    <div className="p-8">
      {/* Breadcrumb */}
      <div className="mb-6">
        <Link href="/accounts" className="text-sm text-gray-500 hover:text-gray-700">
          ← Accounts
        </Link>
      </div>

      {/* Account Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-gray-900">{account.name}</h1>
            {activeProducts.map((p) => (
              <ProductBadge key={p} product={p} />
            ))}
            {account.tier && (
              <span className="badge bg-gray-100 text-gray-600">{ACCOUNT_TIERS[account.tier] ?? account.tier}</span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <span className="text-sm text-gray-500">
              {GCC_COUNTRIES[account.country] ?? account.country}
            </span>
            <span className="text-gray-300">·</span>
            <span className="text-sm text-gray-500">
              {SECTORS[account.sector] ?? account.sector}
            </span>
            {account.owner && (
              <>
                <span className="text-gray-300">·</span>
                <span className="text-sm text-gray-500">Owner: {account.owner.name}</span>
              </>
            )}
            {account.industry && (
              <>
                <span className="text-gray-300">·</span>
                <span className="text-sm text-gray-500">{account.industry}</span>
              </>
            )}
            {account.size && (
              <>
                <span className="text-gray-300">·</span>
                <span className="text-sm text-gray-500">{COMPANY_SIZES[account.size] ?? account.size}</span>
              </>
            )}
          </div>
          {account.locationsCount != null && (
            <p className="text-sm text-gray-500 mt-1">{account.locationsCount} locations</p>
          )}
          {account.description && (
            <p className="text-sm text-gray-600 mt-2 max-w-xl">{account.description}</p>
          )}
          {account.pastEngagements && (
            <p className="text-sm text-gray-500 mt-1">
              <span className="font-medium text-gray-600">Past engagements:</span> {account.pastEngagements}
            </p>
          )}
          {account.website && (
            <a
              href={account.website}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-brand-600 hover:underline mt-1 inline-block"
            >
              {account.website}
            </a>
          )}
        </div>
        <Link href={`/accounts/${account.id}/edit`} className="btn-secondary">
          Edit
        </Link>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="card p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Contacts</p>
          <p className="text-2xl font-bold text-brand-600 mt-1">{account.contacts.length}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Open Deals</p>
          <p className="text-2xl font-bold text-orange-600 mt-1">{openDeals.length}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Pipeline Value</p>
          <p className="text-2xl font-bold text-green-600 mt-1">{fmt(pipelineValue)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Contacts */}
        <div className="card p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-sm font-semibold text-gray-700">Contacts</h2>
            <Link
              href={`/contacts/new?accountId=${account.id}`}
              className="text-xs text-brand-600 hover:underline"
            >
              + Add
            </Link>
          </div>
          {account.contacts.length === 0 && (
            <p className="text-sm text-gray-400">No contacts yet.</p>
          )}
          <div className="space-y-3">
            {account.contacts.map((c) => (
              <div key={c.id} className="flex items-center justify-between">
                <div>
                  <Link
                    href={`/contacts/${c.id}`}
                    className="text-sm font-medium text-brand-600 hover:underline"
                  >
                    {c.firstName} {c.lastName}
                  </Link>
                  <p className="text-xs text-gray-500">
                    {c.title}
                    {c.role && ` · ${CONTACT_ROLES[c.role] ?? c.role}`}
                  </p>
                </div>
                {c.email && (
                  <a href={`mailto:${c.email}`} className="text-xs text-gray-400 hover:text-brand-600">
                    {c.email}
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Opportunities grouped by product */}
        <div className="card p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-sm font-semibold text-gray-700">Opportunities by Product</h2>
            <Link
              href={`/opportunities/new?accountId=${account.id}`}
              className="text-xs text-brand-600 hover:underline"
            >
              + Add
            </Link>
          </div>
          {productGroups.length === 0 && (
            <p className="text-sm text-gray-400">No opportunities yet.</p>
          )}
          <div className="space-y-5">
            {productGroups.map((group) => {
              const meta = PRODUCTS_META[group.key];
              const groupValue = group.opps
                .filter((o) => !o.closedAt)
                .reduce((s, o) => s + (o.value ?? 0), 0);
              return (
                <div key={group.key}>
                  <div className="flex items-center justify-between mb-2">
                    <ProductBadge product={group.key} size="md" />
                    {groupValue > 0 && (
                      <span className={`text-xs font-semibold ${meta.text}`}>{fmt(groupValue)} open</span>
                    )}
                  </div>
                  <div className="space-y-2 pl-1 border-l-2 border-gray-100 ml-1">
                    {group.opps.map((opp) => (
                      <div key={opp.id} className="flex items-center justify-between pl-3">
                        <div className="min-w-0">
                          <Link
                            href={`/opportunities/${opp.id}`}
                            className="text-sm font-medium text-brand-600 hover:underline"
                          >
                            {opp.name}
                          </Link>
                          <p className="text-xs text-gray-500">
                            {opp.expectedCloseDate &&
                              `Close ${new Date(opp.expectedCloseDate).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}`}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <span className={`badge ${stageColor(opp.stage)}`}>
                            {opp.stageRef?.name ?? opp.stage}
                          </span>
                          {opp.value && (
                            <p className="text-xs text-gray-500 mt-0.5">{fmt(opp.value)}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Activity Feed */}
        <div className="card p-6 lg:col-span-2">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-sm font-semibold text-gray-700">Activity Feed</h2>
            <Link
              href={`/activities/new?accountId=${account.id}`}
              className="text-xs text-brand-600 hover:underline"
            >
              + Log Activity
            </Link>
          </div>
          {account.activities.length === 0 && (
            <p className="text-sm text-gray-400">No activities logged yet.</p>
          )}
          <div className="space-y-3">
            {account.activities.map((act) => (
              <div key={act.id} className="flex items-start gap-3 py-2 border-b border-gray-50 last:border-0">
                <div className="w-7 h-7 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-bold shrink-0">
                  {act.type[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800">{act.subject}</p>
                  {act.notes && (
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{act.notes}</p>
                  )}
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-gray-400">{ACTIVITY_TYPES[act.type]}</span>
                    {act.contact && (
                      <span className="text-xs text-gray-400">
                        · {act.contact.firstName} {act.contact.lastName}
                      </span>
                    )}
                    {act.opportunity && (
                      <Link
                        href={`/opportunities/${act.opportunity.id}`}
                        className="text-xs text-brand-600 hover:underline"
                      >
                        · {act.opportunity.name}
                      </Link>
                    )}
                  </div>
                </div>
                <span className="text-xs text-gray-400 shrink-0">
                  {new Date(act.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

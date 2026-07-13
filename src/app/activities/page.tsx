export const dynamic = "force-dynamic";

import Link from "next/link";
import { Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { ACTIVITY_TYPES } from "@/lib/constants";
import { parseProductParam, PRODUCTS_META, inheritedProduct } from "@/lib/products";
import { activityProductWhere } from "@/lib/filters";
import { fmtDate } from "@/lib/format";
import ProductSelector from "@/components/ProductSelector";
import ProductBadge from "@/components/ProductBadge";

type SearchParams = {
  type?: string;
  product?: string;
  ownerId?: string;
  accountId?: string;
  from?: string;
  to?: string;
  search?: string;
};

async function getActivities(sp: SearchParams) {
  const product = parseProductParam(sp.product);
  return prisma.activity.findMany({
    where: {
      AND: [
        sp.type ? { type: sp.type } : {},
        activityProductWhere(product ?? ""),
        sp.ownerId ? { ownerId: sp.ownerId } : {},
        sp.accountId ? { accountId: sp.accountId } : {},
        sp.from ? { date: { gte: new Date(sp.from) } } : {},
        sp.to ? { date: { lte: new Date(`${sp.to}T23:59:59`) } } : {},
        sp.search
          ? { OR: [{ subject: { contains: sp.search } }, { notes: { contains: sp.search } }] }
          : {},
      ],
    },
    include: {
      lead: { select: { id: true, name: true, primaryProduct: true } },
      account: { select: { id: true, name: true } },
      contact: { select: { id: true, firstName: true, lastName: true } },
      opportunity: { select: { id: true, name: true, product: true } },
      owner: { select: { id: true, name: true } },
    },
    orderBy: { date: "desc" },
    take: 100,
  });
}

const TYPE_COLORS: Record<string, string> = {
  MEETING: "bg-blue-100 text-blue-700",
  CALL: "bg-green-100 text-green-700",
  EMAIL: "bg-yellow-100 text-yellow-700",
  NOTE: "bg-gray-100 text-gray-700",
  DEMO: "bg-purple-100 text-purple-700",
};

export default async function ActivitiesPage({ searchParams }: { searchParams: SearchParams }) {
  const product = parseProductParam(searchParams.product);
  const [activities, owners, accounts] = await Promise.all([
    getActivities(searchParams),
    prisma.teamMember.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.account.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {product ? `${PRODUCTS_META[product].label} Activities` : "Activities"}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">{activities.length} logged</p>
        </div>
        <Link href="/activities/new" className="btn-primary">
          <Plus size={16} aria-hidden /> Log Activity
        </Link>
      </div>

      <div className="mb-4">
        <ProductSelector />
      </div>

      {/* Filters */}
      <form method="GET" className="flex gap-3 mb-6 flex-wrap">
        {product && <input type="hidden" name="product" value={product} />}
        <input
          name="search"
          defaultValue={searchParams.search ?? ""}
          placeholder="Search subject or notes…"
          aria-label="Search activities"
          className="input w-56"
        />
        <label className="sr-only" htmlFor="act-type">Type</label>
        <select id="act-type" name="type" defaultValue={searchParams.type ?? ""} className="input w-36">
          <option value="">All Types</option>
          {Object.entries(ACTIVITY_TYPES).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <label className="sr-only" htmlFor="act-owner">Owner</label>
        <select id="act-owner" name="ownerId" defaultValue={searchParams.ownerId ?? ""} className="input w-40">
          <option value="">All Owners</option>
          {owners.map((o) => (
            <option key={o.id} value={o.id}>{o.name}</option>
          ))}
        </select>
        <label className="sr-only" htmlFor="act-account">Account</label>
        <select id="act-account" name="accountId" defaultValue={searchParams.accountId ?? ""} className="input w-48">
          <option value="">All Accounts</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
        <label className="sr-only" htmlFor="act-from">From date</label>
        <input id="act-from" name="from" type="date" defaultValue={searchParams.from ?? ""} className="input w-40" title="From date" />
        <label className="sr-only" htmlFor="act-to">To date</label>
        <input id="act-to" name="to" type="date" defaultValue={searchParams.to ?? ""} className="input w-40" title="To date" />
        <button type="submit" className="btn-secondary">Filter</button>
        {(searchParams.search || searchParams.type || searchParams.ownerId || searchParams.accountId || searchParams.from || searchParams.to) && (
          <Link href={`/activities${product ? `?product=${product}` : ""}`} className="btn-secondary">Clear</Link>
        )}
      </form>

      {/* Feed */}
      <div className="card divide-y divide-gray-100">
        {activities.length === 0 && (
          <div className="p-10 text-center text-gray-400">
            No activities match these filters.{" "}
            <Link href="/activities/new" className="text-brand-600 hover:underline">Log one</Link>
          </div>
        )}
        {activities.map((act) => (
          <div key={act.id} className="flex items-start gap-3 p-4">
            <span className={`badge shrink-0 mt-0.5 ${TYPE_COLORS[act.type] ?? "bg-gray-100 text-gray-700"}`}>
              {ACTIVITY_TYPES[act.type] ?? act.type}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800">{act.subject}</p>
              {act.notes && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{act.notes}</p>}
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <ProductBadge product={inheritedProduct(act)} />
                {act.owner && <span className="text-xs text-gray-500">{act.owner.name}</span>}
                {act.lead && (
                  <Link href={`/leads/${act.lead.id}`} className="text-xs text-brand-600 hover:underline">
                    Lead: {act.lead.name}
                  </Link>
                )}
                {act.account && (
                  <Link href={`/accounts/${act.account.id}`} className="text-xs text-brand-600 hover:underline">
                    {act.account.name}
                  </Link>
                )}
                {act.contact && (
                  <span className="text-xs text-gray-400">
                    {act.contact.firstName} {act.contact.lastName}
                  </span>
                )}
                {act.opportunity && (
                  <Link href={`/opportunities/${act.opportunity.id}`} className="text-xs text-gray-500 hover:text-brand-600">
                    {act.opportunity.name}
                  </Link>
                )}
              </div>
            </div>
            <span className="text-xs text-gray-400 shrink-0">{fmtDate(act.date)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

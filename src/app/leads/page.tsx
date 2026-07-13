export const dynamic = "force-dynamic";

import Link from "next/link";
import { Plus, Inbox } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { COUNTRIES, LEAD_STATUSES, LEAD_SOURCES } from "@/lib/constants";
import { SALES_MOTIONS, parseProductParam, PRODUCTS_META } from "@/lib/products";
import { leadProductWhere } from "@/lib/filters";
import ProductSelector from "@/components/ProductSelector";
import LeadsTable, { type LeadRow } from "./LeadsTable";

type SearchParams = {
  search?: string;
  status?: string;
  markets?: string;
  product?: string;
  ownerId?: string;
  motion?: string;
  source?: string;
  view?: string;
};

async function getLeads(sp: SearchParams) {
  const product = parseProductParam(sp.product);
  return prisma.lead.findMany({
    where: {
      AND: [
        sp.search
          ? {
              OR: [
                { name: { contains: sp.search } },
                { company: { contains: sp.search } },
              ],
            }
          : {},
        sp.status ? { status: sp.status } : {},
        sp.markets ? { markets: { contains: sp.markets } } : {},
        leadProductWhere(product ?? ""),
        sp.ownerId ? { ownerId: sp.ownerId } : {},
        sp.motion ? { salesMotion: sp.motion } : {},
        sp.source ? { source: sp.source } : {},
        sp.view === "overdue" ? { nextActionDate: { lt: new Date() }, status: { not: "DISQUALIFIED" } } : {},
      ],
    },
    include: { owner: { select: { id: true, name: true } } },
    orderBy: [{ score: "desc" }, { createdAt: "desc" }],
  });
}

export default async function LeadsPage({ searchParams }: { searchParams: SearchParams }) {
  const product = parseProductParam(searchParams.product);
  const [leads, owners, unassignedCount] = await Promise.all([
    getLeads(searchParams),
    prisma.teamMember.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.lead.count({ where: { primaryProduct: "UNASSIGNED", status: { not: "DISQUALIFIED" } } }),
  ]);

  const status = searchParams.status ?? "";

  const statusQS = (s: string) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...searchParams, status: s || undefined })) {
      if (v && k !== "view") params.set(k, v);
    }
    const str = params.toString();
    return str ? `?${str}` : "";
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {product ? `${PRODUCTS_META[product].label} Leads` : "Leads"}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">{leads.length} leads</p>
        </div>
        <div className="flex items-center gap-2">
          {unassignedCount > 0 && product !== "UNASSIGNED" && (
            <Link
              href="/leads?product=UNASSIGNED"
              className="btn-secondary border-amber-200 text-amber-700 hover:bg-amber-50"
            >
              <Inbox size={15} aria-hidden /> Unassigned queue ({unassignedCount})
            </Link>
          )}
          <Link href={`/leads/new${product ? `?product=${product}` : ""}`} className="btn-primary">
            <Plus size={16} aria-hidden /> New Lead
          </Link>
        </div>
      </div>

      {/* Product selector */}
      <div className="mb-4">
        <ProductSelector />
      </div>

      {/* Status quick filters */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <Link
          href={`/leads${statusQS("")}`}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${!status ? "bg-brand-600 text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"}`}
        >
          All
        </Link>
        {Object.entries(LEAD_STATUSES).map(([k, v]) => (
          <Link
            key={k}
            href={`/leads${statusQS(k)}`}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${status === k ? "bg-brand-600 text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"}`}
          >
            {v}
          </Link>
        ))}
        <Link
          href={`/leads?${new URLSearchParams({ ...(product ? { product } : {}), view: "overdue" }).toString()}`}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${searchParams.view === "overdue" ? "bg-red-600 text-white" : "bg-white border border-red-200 text-red-600 hover:bg-red-50"}`}
        >
          Overdue actions
        </Link>
      </div>

      {/* Filter toolbar */}
      <form method="GET" className="flex gap-3 mb-6 flex-wrap">
        {product && <input type="hidden" name="product" value={product} />}
        {status && <input type="hidden" name="status" value={status} />}
        <input
          name="search"
          defaultValue={searchParams.search ?? ""}
          placeholder="Search leads…"
          aria-label="Search leads"
          className="input w-52"
        />
        <label className="sr-only" htmlFor="lead-owner">Owner</label>
        <select id="lead-owner" name="ownerId" defaultValue={searchParams.ownerId ?? ""} className="input w-40">
          <option value="">All Owners</option>
          {owners.map((o) => (
            <option key={o.id} value={o.id}>{o.name}</option>
          ))}
        </select>
        <label className="sr-only" htmlFor="lead-market">Market</label>
        <select id="lead-market" name="markets" defaultValue={searchParams.markets ?? ""} className="input w-40">
          <option value="">All Markets</option>
          {Object.entries(COUNTRIES).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <label className="sr-only" htmlFor="lead-motion">Sales motion</label>
        <select id="lead-motion" name="motion" defaultValue={searchParams.motion ?? ""} className="input w-40">
          <option value="">All Motions</option>
          {Object.entries(SALES_MOTIONS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <label className="sr-only" htmlFor="lead-source">Source</label>
        <select id="lead-source" name="source" defaultValue={searchParams.source ?? ""} className="input w-40">
          <option value="">All Sources</option>
          {Object.entries(LEAD_SOURCES).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <button type="submit" className="btn-secondary">Filter</button>
        {(searchParams.search || searchParams.ownerId || searchParams.markets || searchParams.motion || searchParams.source) && (
          <Link href={`/leads${product ? `?product=${product}` : ""}`} className="btn-secondary">Clear</Link>
        )}
      </form>

      <LeadsTable
        leads={JSON.parse(JSON.stringify(leads)) as LeadRow[]}
        owners={owners}
      />
    </div>
  );
}

export const dynamic = "force-dynamic";

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  COUNTRIES, LEAD_STATUSES, LEAD_STATUS_COLORS, PRODUCTS, LEAD_SOURCES,
} from "@/lib/constants";

async function getLeads(search: string, status: string, region: string) {
  return prisma.lead.findMany({
    where: {
      AND: [
        search
          ? {
              OR: [
                { name: { contains: search } },
                { company: { contains: search } },
              ],
            }
          : {},
        status ? { status } : {},
        region ? { region } : {},
      ],
    },
    orderBy: [{ score: "desc" }, { createdAt: "desc" }],
  });
}

function ScoreBadge({ score }: { score: number | null }) {
  if (score == null) return <span className="text-gray-300">—</span>;
  const color =
    score >= 70 ? "bg-green-100 text-green-700"
    : score >= 40 ? "bg-yellow-100 text-yellow-700"
    : "bg-gray-100 text-gray-500";
  return <span className={`badge ${color}`}>{score}</span>;
}

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: { search?: string; status?: string; region?: string };
}) {
  const search = searchParams.search ?? "";
  const status = searchParams.status ?? "";
  const region = searchParams.region ?? "";
  const leads = await getLeads(search, status, region);

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Leads</h1>
          <p className="text-sm text-gray-500 mt-0.5">{leads.length} leads</p>
        </div>
        <Link href="/leads/new" className="btn-primary">+ New Lead</Link>
      </div>

      {/* Status quick filters */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <Link
          href="/leads"
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${!status ? "bg-brand-600 text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"}`}
        >
          All
        </Link>
        {Object.entries(LEAD_STATUSES).map(([k, v]) => (
          <Link
            key={k}
            href={`/leads?status=${k}`}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${status === k ? "bg-brand-600 text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"}`}
          >
            {v}
          </Link>
        ))}
      </div>

      {/* Search + region */}
      <form method="GET" className="flex gap-3 mb-6 flex-wrap">
        {status && <input type="hidden" name="status" value={status} />}
        <input name="search" defaultValue={search} placeholder="Search leads..." className="input w-56" />
        <select name="region" defaultValue={region} className="input w-40">
          <option value="">All Regions</option>
          {Object.entries(COUNTRIES).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <button type="submit" className="btn-secondary">Filter</button>
        {(search || region) && <Link href={status ? `/leads?status=${status}` : "/leads"} className="btn-secondary">Clear</Link>}
      </form>

      {/* Table */}
      <div className="card overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="table-th">Lead</th>
              <th className="table-th">Company</th>
              <th className="table-th">Region</th>
              <th className="table-th">Product Interest</th>
              <th className="table-th">Source</th>
              <th className="table-th text-center">Score</th>
              <th className="table-th">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {leads.length === 0 && (
              <tr>
                <td colSpan={7} className="table-td text-center text-gray-400 py-10">
                  No leads found.{" "}
                  <Link href="/leads/new" className="text-brand-600 hover:underline">Add the first one</Link>
                </td>
              </tr>
            )}
            {leads.map((lead) => (
              <tr key={lead.id} className="hover:bg-gray-50 transition-colors">
                <td className="table-td font-medium">
                  <Link href={`/leads/${lead.id}`} className="text-brand-600 hover:underline">
                    {lead.name}
                  </Link>
                  {lead.title && <p className="text-xs text-gray-400">{lead.title}</p>}
                </td>
                <td className="table-td text-gray-600">{lead.company ?? "—"}</td>
                <td className="table-td text-gray-500">{COUNTRIES[lead.region] ?? lead.region}</td>
                <td className="table-td text-gray-500">
                  {lead.productInterest ? (PRODUCTS[lead.productInterest] ?? lead.productInterest) : "—"}
                </td>
                <td className="table-td text-gray-500">
                  {lead.source ? (LEAD_SOURCES[lead.source] ?? lead.source) : "—"}
                </td>
                <td className="table-td text-center"><ScoreBadge score={lead.score} /></td>
                <td className="table-td">
                  <span className={`badge ${LEAD_STATUS_COLORS[lead.status] ?? "bg-gray-100 text-gray-700"}`}>
                    {LEAD_STATUSES[lead.status] ?? lead.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export const dynamic = "force-dynamic";

import Link from "next/link";
import { Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { GCC_COUNTRIES, SECTORS, ACCOUNT_TIERS } from "@/lib/constants";
import { parseProductParam, PRODUCTS_META } from "@/lib/products";
import { accountProductWhere } from "@/lib/filters";
import { fmtMoney, fmtDate } from "@/lib/format";
import ProductSelector from "@/components/ProductSelector";
import ProductBadge from "@/components/ProductBadge";

type SearchParams = { search?: string; country?: string; sector?: string; product?: string };

async function getAccounts(sp: SearchParams) {
  const product = parseProductParam(sp.product);
  return prisma.account.findMany({
    where: {
      AND: [
        sp.search ? { name: { contains: sp.search } } : {},
        sp.country ? { country: sp.country } : {},
        sp.sector ? { sector: sp.sector } : {},
        accountProductWhere(product ?? ""),
      ],
    },
    include: {
      owner: { select: { id: true, name: true } },
      opportunities: {
        select: { id: true, product: true, value: true, closedAt: true },
      },
      activities: { select: { date: true }, orderBy: { date: "desc" }, take: 1 },
      tasks: {
        where: { status: "OPEN", dueDate: { not: null } },
        select: { dueDate: true },
        orderBy: { dueDate: "asc" },
        take: 1,
      },
      _count: { select: { contacts: true } },
    },
    orderBy: { name: "asc" },
  });
}

export default async function AccountsPage({ searchParams }: { searchParams: SearchParams }) {
  const product = parseProductParam(searchParams.product);
  const accounts = await getAccounts(searchParams);

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {product ? `${PRODUCTS_META[product].label} Accounts` : "Accounts"}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {accounts.length} companies — shared across all business lines
          </p>
        </div>
        <Link href="/accounts/new" className="btn-primary">
          <Plus size={16} aria-hidden /> New Account
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
          placeholder="Search accounts…"
          aria-label="Search accounts"
          className="input w-56"
        />
        <label className="sr-only" htmlFor="acc-country">Country</label>
        <select id="acc-country" name="country" defaultValue={searchParams.country ?? ""} className="input w-44">
          <option value="">All Countries</option>
          {Object.entries(GCC_COUNTRIES).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <label className="sr-only" htmlFor="acc-sector">Sector</label>
        <select id="acc-sector" name="sector" defaultValue={searchParams.sector ?? ""} className="input w-44">
          <option value="">All Sectors</option>
          {Object.entries(SECTORS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <button type="submit" className="btn-secondary">Filter</button>
        {(searchParams.search || searchParams.country || searchParams.sector) && (
          <Link href={`/accounts${product ? `?product=${product}` : ""}`} className="btn-secondary">Clear</Link>
        )}
      </form>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px]">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="table-th">Account</th>
                <th className="table-th">Owner</th>
                <th className="table-th">Market</th>
                <th className="table-th">Active Products</th>
                <th className="table-th text-center">Open Deals</th>
                <th className="table-th text-right">Total Pipeline</th>
                <th className="table-th">Last Activity</th>
                <th className="table-th">Next Activity</th>
                <th className="table-th">Tier</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {accounts.length === 0 && (
                <tr>
                  <td colSpan={9} className="table-td text-center text-gray-400 py-10">
                    No accounts match these filters.{" "}
                    <Link href="/accounts/new" className="text-brand-600 hover:underline">Add one</Link>
                  </td>
                </tr>
              )}
              {accounts.map((acc) => {
                const openOpps = acc.opportunities.filter((o) => !o.closedAt);
                const pipeline = openOpps.reduce((s, o) => s + (o.value ?? 0), 0);
                const products = Array.from(new Set(openOpps.map((o) => o.product))).filter(
                  (p) => p !== "UNASSIGNED"
                );
                return (
                  <tr key={acc.id} className="hover:bg-gray-50 transition-colors">
                    <td className="table-td font-medium whitespace-nowrap">
                      <Link href={`/accounts/${acc.id}`} className="text-brand-600 hover:underline">
                        {acc.name}
                      </Link>
                      <p className="text-xs text-gray-400">{acc.industry ?? ""}</p>
                    </td>
                    <td className="table-td text-gray-500 whitespace-nowrap">
                      {acc.owner?.name ?? <span className="text-gray-300">Unassigned</span>}
                    </td>
                    <td className="table-td text-gray-500 whitespace-nowrap">
                      {GCC_COUNTRIES[acc.country] ?? acc.country}
                    </td>
                    <td className="table-td">
                      {products.length === 0 ? (
                        <span className="text-gray-300">—</span>
                      ) : (
                        <span className="flex gap-1 flex-wrap">
                          {products.map((p) => (
                            <ProductBadge key={p} product={p} />
                          ))}
                        </span>
                      )}
                    </td>
                    <td className="table-td text-center">{openOpps.length}</td>
                    <td className="table-td text-right font-semibold">
                      {pipeline > 0 ? fmtMoney(pipeline) : "—"}
                    </td>
                    <td className="table-td text-gray-500 whitespace-nowrap">
                      {acc.activities[0] ? fmtDate(acc.activities[0].date) : "—"}
                    </td>
                    <td className="table-td text-gray-500 whitespace-nowrap">
                      {acc.tasks[0]?.dueDate ? fmtDate(acc.tasks[0].dueDate) : "—"}
                    </td>
                    <td className="table-td text-gray-500 whitespace-nowrap">
                      {acc.tier ? (ACCOUNT_TIERS[acc.tier] ?? acc.tier) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

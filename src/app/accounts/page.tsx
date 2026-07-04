export const dynamic = "force-dynamic";

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { GCC_COUNTRIES, SECTORS, COMPANY_SIZES } from "@/lib/constants";

async function getAccounts(search: string, country: string, sector: string) {
  return prisma.account.findMany({
    where: {
      AND: [
        search ? { name: { contains: search } } : {},
        country ? { country } : {},
        sector ? { sector } : {},
      ],
    },
    include: { _count: { select: { contacts: true, opportunities: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: { search?: string; country?: string; sector?: string };
}) {
  const search = searchParams.search ?? "";
  const country = searchParams.country ?? "";
  const sector = searchParams.sector ?? "";
  const accounts = await getAccounts(search, country, sector);

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Accounts</h1>
          <p className="text-sm text-gray-500 mt-0.5">{accounts.length} companies</p>
        </div>
        <Link href="/accounts/new" className="btn-primary">
          + New Account
        </Link>
      </div>

      {/* Filters */}
      <form method="GET" className="flex gap-3 mb-6 flex-wrap">
        <input
          name="search"
          defaultValue={search}
          placeholder="Search accounts..."
          className="input w-56"
        />
        <select name="country" defaultValue={country} className="input w-40">
          <option value="">All Countries</option>
          {Object.entries(GCC_COUNTRIES).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select name="sector" defaultValue={sector} className="input w-44">
          <option value="">All Sectors</option>
          {Object.entries(SECTORS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <button type="submit" className="btn-secondary">Filter</button>
        {(search || country || sector) && (
          <Link href="/accounts" className="btn-secondary">Clear</Link>
        )}
      </form>

      {/* Table */}
      <div className="card overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="table-th">Company</th>
              <th className="table-th">Country</th>
              <th className="table-th">Sector</th>
              <th className="table-th">Industry</th>
              <th className="table-th">Size</th>
              <th className="table-th text-center">Contacts</th>
              <th className="table-th text-center">Deals</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {accounts.length === 0 && (
              <tr>
                <td colSpan={7} className="table-td text-center text-gray-400 py-10">
                  No accounts found.{" "}
                  <Link href="/accounts/new" className="text-brand-600 hover:underline">
                    Add the first one
                  </Link>
                </td>
              </tr>
            )}
            {accounts.map((acc) => (
              <tr key={acc.id} className="hover:bg-gray-50 transition-colors">
                <td className="table-td font-medium">
                  <Link href={`/accounts/${acc.id}`} className="text-brand-600 hover:underline">
                    {acc.name}
                  </Link>
                </td>
                <td className="table-td">{GCC_COUNTRIES[acc.country] ?? acc.country}</td>
                <td className="table-td">{SECTORS[acc.sector] ?? acc.sector}</td>
                <td className="table-td text-gray-500">{acc.industry ?? "—"}</td>
                <td className="table-td text-gray-500">
                  {acc.size ? (COMPANY_SIZES[acc.size] ?? acc.size) : "—"}
                </td>
                <td className="table-td text-center">{acc._count.contacts}</td>
                <td className="table-td text-center">{acc._count.opportunities}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

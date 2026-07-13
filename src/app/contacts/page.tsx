export const dynamic = "force-dynamic";

import Link from "next/link";
import { Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { CONTACT_ROLES } from "@/lib/constants";
import { parseProductParam, PRODUCTS_META } from "@/lib/products";
import { fmtDate } from "@/lib/format";
import ProductSelector from "@/components/ProductSelector";
import ProductBadge from "@/components/ProductBadge";

type SearchParams = { search?: string; product?: string };

async function getContacts(sp: SearchParams) {
  const product = parseProductParam(sp.product);
  return prisma.contact.findMany({
    where: {
      AND: [
        sp.search
          ? {
              OR: [
                { firstName: { contains: sp.search } },
                { lastName: { contains: sp.search } },
                { email: { contains: sp.search } },
                { title: { contains: sp.search } },
              ],
            }
          : {},
        product ? { opportunities: { some: { opportunity: { product } } } } : {},
      ],
    },
    include: {
      account: { select: { id: true, name: true, owner: { select: { name: true } } } },
      opportunities: {
        include: { opportunity: { select: { id: true, product: true, closedAt: true } } },
      },
      activities: { select: { date: true }, orderBy: { date: "desc" }, take: 1 },
      tasks: {
        where: { status: "OPEN", dueDate: { not: null } },
        select: { dueDate: true },
        orderBy: { dueDate: "asc" },
        take: 1,
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

export default async function ContactsPage({ searchParams }: { searchParams: SearchParams }) {
  const product = parseProductParam(searchParams.product);
  const contacts = await getContacts(searchParams);

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {product ? `${PRODUCTS_META[product].label} Contacts` : "Contacts"}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {contacts.length} people — shared across all business lines
          </p>
        </div>
        <Link href="/contacts/new" className="btn-primary">
          <Plus size={16} aria-hidden /> New Contact
        </Link>
      </div>

      <div className="mb-4">
        <ProductSelector />
      </div>

      {/* Search */}
      <form method="GET" className="flex gap-3 mb-6">
        {product && <input type="hidden" name="product" value={product} />}
        <input
          name="search"
          defaultValue={searchParams.search ?? ""}
          placeholder="Search by name, email, title…"
          aria-label="Search contacts"
          className="input w-72"
        />
        <button type="submit" className="btn-secondary">Search</button>
        {searchParams.search && (
          <Link href={`/contacts${product ? `?product=${product}` : ""}`} className="btn-secondary">Clear</Link>
        )}
      </form>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px]">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="table-th">Name</th>
                <th className="table-th">Account</th>
                <th className="table-th">Buying Role</th>
                <th className="table-th">Product Relationships</th>
                <th className="table-th text-center">Active Deals</th>
                <th className="table-th">Account Owner</th>
                <th className="table-th">Last Interaction</th>
                <th className="table-th">Next Interaction</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {contacts.length === 0 && (
                <tr>
                  <td colSpan={8} className="table-td text-center text-gray-400 py-10">
                    No contacts match.{" "}
                    <Link href="/contacts/new" className="text-brand-600 hover:underline">Add one</Link>
                  </td>
                </tr>
              )}
              {contacts.map((c) => {
                const openOpps = c.opportunities.filter((o) => !o.opportunity.closedAt);
                const products = Array.from(new Set(openOpps.map((o) => o.opportunity.product))).filter(
                  (p) => p !== "UNASSIGNED"
                );
                return (
                  <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                    <td className="table-td font-medium whitespace-nowrap">
                      <Link href={`/contacts/${c.id}`} className="text-brand-600 hover:underline">
                        {c.firstName} {c.lastName}
                      </Link>
                      {c.title && <p className="text-xs text-gray-400">{c.title}</p>}
                    </td>
                    <td className="table-td whitespace-nowrap">
                      {c.account ? (
                        <Link href={`/accounts/${c.account.id}`} className="text-gray-600 hover:underline">
                          {c.account.name}
                        </Link>
                      ) : "—"}
                    </td>
                    <td className="table-td">
                      {c.role ? (
                        <span className="badge bg-purple-100 text-purple-700">
                          {CONTACT_ROLES[c.role] ?? c.role}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
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
                    <td className="table-td text-gray-500 whitespace-nowrap">
                      {c.account?.owner?.name ?? "—"}
                    </td>
                    <td className="table-td text-gray-500 whitespace-nowrap">
                      {c.activities[0] ? fmtDate(c.activities[0].date) : "—"}
                    </td>
                    <td className="table-td text-gray-500 whitespace-nowrap">
                      {c.tasks[0]?.dueDate ? fmtDate(c.tasks[0].dueDate) : "—"}
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

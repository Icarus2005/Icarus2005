export const dynamic = "force-dynamic";

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { CONTACT_ROLES, GCC_COUNTRIES } from "@/lib/constants";

async function getContacts(search: string) {
  return prisma.contact.findMany({
    where: search
      ? {
          OR: [
            { firstName: { contains: search } },
            { lastName: { contains: search } },
            { email: { contains: search } },
            { title: { contains: search } },
          ],
        }
      : {},
    include: {
      account: { select: { id: true, name: true, country: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: { search?: string };
}) {
  const search = searchParams.search ?? "";
  const contacts = await getContacts(search);

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Contacts</h1>
          <p className="text-sm text-gray-500 mt-0.5">{contacts.length} people</p>
        </div>
        <Link href="/contacts/new" className="btn-primary">
          + New Contact
        </Link>
      </div>

      {/* Search */}
      <form method="GET" className="flex gap-3 mb-6">
        <input
          name="search"
          defaultValue={search}
          placeholder="Search by name, email, title..."
          className="input w-72"
        />
        <button type="submit" className="btn-secondary">Search</button>
        {search && <Link href="/contacts" className="btn-secondary">Clear</Link>}
      </form>

      {/* Table */}
      <div className="card overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="table-th">Name</th>
              <th className="table-th">Title</th>
              <th className="table-th">Role</th>
              <th className="table-th">Account</th>
              <th className="table-th">Email</th>
              <th className="table-th">Phone</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {contacts.length === 0 && (
              <tr>
                <td colSpan={6} className="table-td text-center text-gray-400 py-10">
                  No contacts found.{" "}
                  <Link href="/contacts/new" className="text-brand-600 hover:underline">
                    Add the first one
                  </Link>
                </td>
              </tr>
            )}
            {contacts.map((c) => (
              <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                <td className="table-td font-medium">
                  <Link href={`/contacts/${c.id}`} className="text-brand-600 hover:underline">
                    {c.firstName} {c.lastName}
                  </Link>
                </td>
                <td className="table-td text-gray-500">{c.title ?? "—"}</td>
                <td className="table-td">
                  {c.role ? (
                    <span className="badge bg-purple-100 text-purple-700">
                      {CONTACT_ROLES[c.role] ?? c.role}
                    </span>
                  ) : "—"}
                </td>
                <td className="table-td">
                  {c.account ? (
                    <Link href={`/accounts/${c.account.id}`} className="text-brand-600 hover:underline">
                      {c.account.name}
                    </Link>
                  ) : "—"}
                  {c.account?.country && (
                    <span className="text-xs text-gray-400 ml-1">
                      ({GCC_COUNTRIES[c.account.country] ?? c.account.country})
                    </span>
                  )}
                </td>
                <td className="table-td">
                  {c.email ? (
                    <a href={`mailto:${c.email}`} className="text-gray-600 hover:text-brand-600">
                      {c.email}
                    </a>
                  ) : "—"}
                </td>
                <td className="table-td text-gray-500">{c.phone ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

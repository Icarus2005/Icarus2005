import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ACTIVITY_TYPES } from "@/lib/constants";

async function getActivities(type: string) {
  return prisma.activity.findMany({
    where: type ? { type } : {},
    include: {
      account: { select: { id: true, name: true } },
      contact: { select: { id: true, firstName: true, lastName: true } },
      opportunity: { select: { id: true, name: true } },
    },
    orderBy: { date: "desc" },
  });
}

const TYPE_COLORS: Record<string, string> = {
  MEETING: "bg-blue-100 text-blue-700",
  CALL: "bg-green-100 text-green-700",
  EMAIL: "bg-yellow-100 text-yellow-700",
  NOTE: "bg-gray-100 text-gray-700",
  DEMO: "bg-purple-100 text-purple-700",
};

export default async function ActivitiesPage({
  searchParams,
}: {
  searchParams: { type?: string };
}) {
  const type = searchParams.type ?? "";
  const activities = await getActivities(type);

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Activities</h1>
          <p className="text-sm text-gray-500 mt-0.5">{activities.length} logged</p>
        </div>
        <Link href="/activities/new" className="btn-primary">+ Log Activity</Link>
      </div>

      {/* Type filter */}
      <div className="flex gap-2 mb-6 flex-wrap">
        <Link
          href="/activities"
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${!type ? "bg-brand-600 text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"}`}
        >
          All
        </Link>
        {Object.entries(ACTIVITY_TYPES).map(([k, v]) => (
          <Link
            key={k}
            href={`/activities?type=${k}`}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${type === k ? "bg-brand-600 text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"}`}
          >
            {v}
          </Link>
        ))}
      </div>

      {/* Activity list */}
      <div className="space-y-2">
        {activities.length === 0 && (
          <div className="card p-10 text-center text-gray-400">
            No activities yet.{" "}
            <Link href="/activities/new" className="text-brand-600 hover:underline">
              Log the first one
            </Link>
          </div>
        )}
        {activities.map((act) => (
          <div key={act.id} className="card p-4 flex items-start gap-4">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${TYPE_COLORS[act.type] ?? "bg-gray-100 text-gray-700"}`}>
              {act.type[0]}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-gray-800">{act.subject}</p>
                  {act.notes && (
                    <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">{act.notes}</p>
                  )}
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    <span className={`badge ${TYPE_COLORS[act.type] ?? "bg-gray-100 text-gray-700"}`}>
                      {ACTIVITY_TYPES[act.type]}
                    </span>
                    {act.account && (
                      <Link href={`/accounts/${act.account.id}`} className="text-xs text-brand-600 hover:underline">
                        {act.account.name}
                      </Link>
                    )}
                    {act.contact && (
                      <Link href={`/contacts/${act.contact.id}`} className="text-xs text-gray-500 hover:text-brand-600">
                        {act.contact.firstName} {act.contact.lastName}
                      </Link>
                    )}
                    {act.opportunity && (
                      <Link href={`/opportunities/${act.opportunity.id}`} className="text-xs text-gray-500 hover:text-brand-600">
                        {act.opportunity.name}
                      </Link>
                    )}
                  </div>
                </div>
                <span className="text-xs text-gray-400 shrink-0">
                  {new Date(act.date).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

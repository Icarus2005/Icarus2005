import { prisma } from "@/lib/prisma";
import { getEmailFeatureFlags } from "@/lib/email/featureFlags";
import { getMailboxSyncHealthReport } from "@/lib/email/reporting";
import { fmtDateYear } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function EmailHealthPage() {
  const flags = getEmailFeatureFlags();
  if (!flags.EMAIL_READ_SYNC_ENABLED) {
    return (
      <div className="p-5 md:p-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">Read-only mailbox intelligence</p>
        <h1 className="mt-1 text-2xl font-bold text-gray-950">Email synchronization health</h1>
        <div className="card mt-6 p-5">
          <p className="text-sm font-semibold text-gray-900">Synchronization is disabled</p>
          <p className="mt-2 text-sm text-gray-500">No mailbox connection, provider request or Sprint 4B reporting query is attempted while the feature flag is off.</p>
        </div>
      </div>
    );
  }
  const report = await getMailboxSyncHealthReport(prisma);

  return (
    <div className="p-5 md:p-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">Read-only mailbox intelligence</p>
        <h1 className="mt-1 text-2xl font-bold text-gray-950">Email synchronization health</h1>
        <p className="mt-2 text-sm text-gray-500">Operational metadata only. Message bodies, snippets and attachments are never shown or stored.</p>
      </header>

      <section className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Read sync flag", flags.EMAIL_READ_SYNC_ENABLED ? "Enabled" : "Disabled"],
          ["Mailbox connections", report.summary.connections],
          ["Enabled connections", report.summary.enabledConnections],
          ["Unmatched messages", report.summary.unmatchedMessages],
        ].map(([label, value]) => (
          <div key={label} className="card p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
            <p className="mt-1 text-lg font-bold text-gray-900">{value}</p>
          </div>
        ))}
      </section>

      <section className="card mt-6 p-5">
        <h2 className="text-sm font-semibold text-gray-800">Connections and recovery state</h2>
        {report.connections.length === 0 ? (
          <p className="mt-4 text-sm text-gray-500">No mailbox connection is configured.</p>
        ) : (
          <div className="mt-4 space-y-4">
            {report.connections.map((connection) => (
              <article key={connection.id} className="rounded-lg border border-gray-100 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div><p className="text-sm font-semibold text-gray-900">{connection.emailAddress}</p><p className="text-xs text-gray-400">{connection.provider} · {connection.totalMessages} metadata records</p></div>
                  <span className="badge bg-gray-100 text-gray-700">{connection.health}</span>
                </div>
                <p className="mt-2 text-xs text-gray-500">Exact: {connection.exactMatches} · Unmatched: {connection.unmatched} · Ambiguous: {connection.ambiguous}</p>
                {connection.cursors.map((cursor) => (
                  <div key={cursor.folderKey} className="mt-2 rounded bg-gray-50 p-2 text-xs text-gray-500">
                    {cursor.folderKey} · last success {cursor.lastSuccessfulAt ? fmtDateYear(cursor.lastSuccessfulAt) : "never"} · failures {cursor.consecutiveFailures}
                    {cursor.lastErrorCode ? ` · ${cursor.lastErrorCode}` : ""}
                  </div>
                ))}
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="card mt-6 p-5">
        <h2 className="text-sm font-semibold text-gray-800">Unmatched message review</h2>
        <p className="mt-1 text-xs text-gray-500">No automatic Contact or Account creation occurs. Review is metadata-only.</p>
        {report.unmatchedMessages.length === 0 ? <p className="mt-4 text-sm text-gray-500">No unmatched messages.</p> : (
          <div className="mt-4 overflow-x-auto"><table className="min-w-full text-left text-xs"><thead><tr className="text-gray-400"><th className="p-2">Date</th><th className="p-2">Direction</th><th className="p-2">From</th><th className="p-2">Subject</th><th className="p-2">State</th></tr></thead><tbody>
            {report.unmatchedMessages.map((message) => <tr key={message.id} className="border-t border-gray-100"><td className="p-2">{fmtDateYear(message.providerSentAt)}</td><td className="p-2">{message.direction}</td><td className="p-2">{message.fromAddress}</td><td className="p-2">{message.subject ?? "(No subject)"}</td><td className="p-2">{message.matchState}</td></tr>)}
          </tbody></table></div>
        )}
      </section>
    </div>
  );
}

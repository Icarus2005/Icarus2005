import Link from "next/link";
import { fmtDateYear } from "@/lib/format";
import {
  deriveRelationshipNextAction,
  relationshipTaskConditions,
  type LegacyNextActionRef,
  type RelationshipTaskRef,
} from "@/lib/relationshipMemory";

function DateFacts({ task }: { task: Pick<RelationshipTaskRef, "status" | "dueDate" | "clientCommitmentDate"> }) {
  const conditions = relationshipTaskConditions(task);
  return (
    <div className="mt-1.5 flex flex-wrap gap-2 text-[11px]">
      <span className={conditions.includes("OVERDUE_INTERNAL") ? "font-semibold text-red-600" : "text-gray-500"}>
        Internal target: {task.dueDate ? fmtDateYear(task.dueDate) : "Not scheduled"}
      </span>
      <span className="text-gray-300">·</span>
      <span className={conditions.includes("OVERDUE_COMMITMENT") ? "font-semibold text-red-600" : "text-gray-500"}>
        Client commitment: {task.clientCommitmentDate ? fmtDateYear(task.clientCommitmentDate) : "None recorded"}
      </span>
      {conditions.includes("NEEDS_SCHEDULING") && <span className="rounded-full bg-sky-100 px-2 py-0.5 font-semibold text-sky-700">Needs Scheduling</span>}
      {conditions.includes("OVERDUE_INTERNAL") && <span className="rounded-full bg-red-100 px-2 py-0.5 font-semibold text-red-700">Internal target overdue</span>}
      {conditions.includes("OVERDUE_COMMITMENT") && <span className="rounded-full bg-red-100 px-2 py-0.5 font-semibold text-red-700">Client commitment overdue</span>}
    </div>
  );
}

export default function RelationshipActions({
  tasks,
  legacyCandidates,
  addTaskHref,
}: {
  tasks: RelationshipTaskRef[];
  legacyCandidates?: LegacyNextActionRef[];
  addTaskHref: string;
}) {
  const next = deriveRelationshipNextAction(tasks, legacyCandidates);
  const open = tasks.filter((task) => task.status === "OPEN");
  const completed = tasks.filter((task) => task.status === "DONE");

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-brand-100 bg-brand-50/50 p-4" aria-label="Next canonical action">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-brand-600">Next action</p>
            {next ? (
              <>
                <Link href={next.href} className="mt-1 block text-sm font-semibold text-gray-900 hover:text-brand-700">{next.label}</Link>
                <p className="mt-1 text-xs text-gray-500">{next.provenance}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${next.source === "task" ? "bg-emerald-100 text-emerald-700" : "bg-gray-200 text-gray-700"}`}>
                    {next.source === "task" ? "Canonical open Task" : "Legacy summary fallback"}
                  </span>
                  <span className="text-xs text-gray-600">Internal target: {next.date ? fmtDateYear(next.date) : "Not scheduled"}</span>
                  {next.clientCommitmentDate && <span className="text-xs text-gray-600">Client commitment: {fmtDateYear(next.clientCommitmentDate)}</span>}
                </div>
                {next.source === "legacy" && (
                  <p className="mt-2 text-[11px] text-amber-700">No canonical open Task exists; this value is retained from a linked record’s legacy next-action summary.</p>
                )}
              </>
            ) : (
              <>
                <p className="mt-1 text-sm font-medium text-gray-700">No next action is recorded.</p>
                <p className="mt-1 text-xs text-gray-500">Create a canonical Task rather than relying on notes or memory.</p>
              </>
            )}
          </div>
          <Link href={addTaskHref} className="btn-primary shrink-0">Add Task</Link>
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Open Tasks</h3>
          <span className="text-xs text-gray-400">{open.length}</span>
        </div>
        {open.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-200 p-4 text-sm text-gray-400">No canonical open Tasks.</p>
        ) : (
          <div className="space-y-2">
            {open.map((task) => (
              <article key={task.id} className="rounded-lg border border-gray-100 bg-white p-3">
                <Link href={task.href} className="text-sm font-medium text-gray-900 hover:text-brand-700">{task.title}</Link>
                <p className="mt-0.5 text-[11px] text-gray-400">{task.provenance}</p>
                <DateFacts task={task} />
              </article>
            ))}
          </div>
        )}
      </section>

      <details>
        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-gray-500">
          Completed Tasks ({completed.length})
        </summary>
        {completed.length === 0 ? (
          <p className="mt-2 text-sm text-gray-400">No completed Tasks are linked.</p>
        ) : (
          <div className="mt-2 space-y-2">
            {completed.map((task) => (
              <article key={task.id} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                <Link href={task.href} className="text-sm font-medium text-gray-600 hover:text-brand-700">{task.title}</Link>
                <p className="mt-0.5 text-[11px] text-gray-400">{task.provenance}</p>
                <DateFacts task={task} />
              </article>
            ))}
          </div>
        )}
      </details>
    </div>
  );
}

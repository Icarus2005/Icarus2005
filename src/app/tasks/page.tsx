"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import ProductSelector from "@/components/ProductSelector";
import ProductBadge from "@/components/ProductBadge";
import { inheritedProduct } from "@/lib/products";
import { TASK_PRIORITIES, TASK_PRIORITY_COLORS } from "@/lib/constants";

type Task = {
  id: string;
  title: string;
  notes: string | null;
  dueDate: string | null;
  status: string;
  priority: string;
  product: string | null;
  lead: { id: string; name: string; company: string | null; primaryProduct: string } | null;
  account: { id: string; name: string } | null;
  contact: { id: string; firstName: string; lastName: string } | null;
  opportunity: { id: string; name: string; product: string } | null;
  owner: { id: string; name: string } | null;
};

type Member = { id: string; name: string; active: boolean };

type Bucket = { label: string; tasks: Task[] };

function bucketize(tasks: Task[]): Bucket[] {
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const today = startOfDay(now);
  const tomorrow = new Date(today.getTime() + 86_400_000);
  const dayAfter = new Date(tomorrow.getTime() + 86_400_000);
  const weekEnd = new Date(today.getTime() + 7 * 86_400_000);

  const buckets: Record<string, Task[]> = {
    Overdue: [], Today: [], Tomorrow: [], "This Week": [], Later: [], "No due date": [], Completed: [],
  };
  for (const t of tasks) {
    if (t.status === "DONE") { buckets.Completed.push(t); continue; }
    if (!t.dueDate) { buckets["No due date"].push(t); continue; }
    const due = new Date(t.dueDate);
    if (due < today) buckets.Overdue.push(t);
    else if (due < tomorrow) buckets.Today.push(t);
    else if (due < dayAfter) buckets.Tomorrow.push(t);
    else if (due < weekEnd) buckets["This Week"].push(t);
    else buckets.Later.push(t);
  }
  return Object.entries(buckets)
    .map(([label, ts]) => ({ label, tasks: ts }))
    .filter((b) => b.tasks.length > 0);
}

function TasksPageInner() {
  const searchParams = useSearchParams();
  const product = searchParams.get("product") ?? "";
  const [tasks, setTasks] = useState<Task[]>([]);
  const [owners, setOwners] = useState<Member[]>([]);
  const [ownerId, setOwnerId] = useState("");
  const [showDone, setShowDone] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    const params = new URLSearchParams();
    if (product) params.set("product", product);
    if (ownerId) params.set("ownerId", ownerId);
    try {
      const res = await fetch(`/api/tasks?${params.toString()}`);
      if (!res.ok) throw new Error();
      setTasks(await res.json());
    } catch {
      setError("Could not load tasks.");
    }
    setLoading(false);
  }, [product, ownerId]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  useEffect(() => {
    fetch("/api/team")
      .then((r) => r.json())
      .then((list: Member[]) => setOwners(list.filter((m) => m.active)))
      .catch(() => {});
  }, []);

  async function toggle(task: Task) {
    const newStatus = task.status === "DONE" ? "OPEN" : "DONE";
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: newStatus } : t)));
    await fetch(`/api/tasks/${task.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    load();
  }

  async function remove(id: string) {
    if (!confirm("Delete this task?")) return;
    setTasks((prev) => prev.filter((t) => t.id !== id));
    await fetch(`/api/tasks/${id}`, { method: "DELETE" });
  }

  const buckets = bucketize(tasks).filter((b) => (showDone ? true : b.label !== "Completed"));
  const now = new Date();

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tasks</h1>
          <p className="text-sm text-gray-500 mt-0.5">Follow-ups and reminders across business lines</p>
        </div>
        <Link href={`/tasks/new${product ? `?product=${product}` : ""}`} className="btn-primary">
          <Plus size={16} aria-hidden /> New Task
        </Link>
      </div>

      <div className="mb-4">
        <ProductSelector />
      </div>

      <div className="flex gap-3 mb-6 items-center flex-wrap">
        <label className="sr-only" htmlFor="task-owner">Owner</label>
        <select
          id="task-owner"
          value={ownerId}
          onChange={(e) => setOwnerId(e.target.value)}
          className="input w-48"
        >
          <option value="">All Owners</option>
          {owners.map((o) => (
            <option key={o.id} value={o.id}>{o.name}</option>
          ))}
        </select>
        <label className="inline-flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={showDone}
            onChange={(e) => setShowDone(e.target.checked)}
            className="accent-brand-600"
          />
          Show completed
        </label>
      </div>

      {error && (
        <div role="alert" className="card p-4 mb-4 text-red-600 text-sm">{error}</div>
      )}
      {loading && <div className="card p-8 text-center text-gray-400">Loading…</div>}
      {!loading && buckets.length === 0 && (
        <div className="card p-10 text-center text-gray-400">
          No tasks here.{" "}
          <Link href="/tasks/new" className="text-brand-600 hover:underline">Create one</Link>
        </div>
      )}

      <div className="space-y-6">
        {buckets.map((bucket) => (
          <section key={bucket.label} aria-label={bucket.label}>
            <h2 className={`text-xs font-semibold uppercase tracking-widest mb-2 ${
              bucket.label === "Overdue" ? "text-red-600" : "text-gray-400"
            }`}>
              {bucket.label} <span className="font-normal">({bucket.tasks.length})</span>
            </h2>
            <div className="space-y-2">
              {bucket.tasks.map((task) => {
                const overdue = task.status === "OPEN" && task.dueDate && new Date(task.dueDate) < now;
                return (
                  <div key={task.id} className={`card p-4 flex items-start gap-3 ${overdue ? "border-l-4 border-l-red-500" : ""}`}>
                    <input
                      type="checkbox"
                      aria-label={`Mark ${task.title} ${task.status === "DONE" ? "open" : "done"}`}
                      checked={task.status === "DONE"}
                      onChange={() => toggle(task)}
                      className="mt-1 w-4 h-4 rounded border-gray-300 accent-brand-600 cursor-pointer"
                    />
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${task.status === "DONE" ? "text-gray-400 line-through" : "text-gray-800"}`}>
                        {task.title}
                      </p>
                      {task.notes && <p className="text-xs text-gray-500 mt-0.5">{task.notes}</p>}
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <ProductBadge product={inheritedProduct(task)} />
                        <span className={`badge ${TASK_PRIORITY_COLORS[task.priority] ?? "bg-gray-100 text-gray-600"}`}>
                          {TASK_PRIORITIES[task.priority] ?? task.priority}
                        </span>
                        {task.owner && <span className="text-xs text-gray-500">{task.owner.name}</span>}
                        {task.lead && (
                          <Link href={`/leads/${task.lead.id}`} className="text-xs text-brand-600 hover:underline">
                            Lead: {task.lead.name}
                          </Link>
                        )}
                        {task.opportunity && (
                          <Link href={`/opportunities/${task.opportunity.id}`} className="text-xs text-brand-600 hover:underline">
                            {task.opportunity.name}
                          </Link>
                        )}
                        {task.account && (
                          <Link href={`/accounts/${task.account.id}`} className="text-xs text-gray-500 hover:text-brand-600">
                            {task.account.name}
                          </Link>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0 flex flex-col items-end gap-1.5">
                      {task.dueDate && (
                        <span className={`text-xs font-medium ${overdue ? "text-red-600" : "text-gray-400"}`}>
                          {overdue ? "Overdue · " : ""}
                          {new Date(task.dueDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                        </span>
                      )}
                      <button
                        onClick={() => remove(task.id)}
                        title="Delete task"
                        aria-label={`Delete ${task.title}`}
                        className="text-gray-300 hover:text-red-500 transition-colors p-1"
                      >
                        <Trash2 size={14} aria-hidden />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

export default function TasksPage() {
  return (
    <Suspense fallback={<div className="p-8 text-gray-400">Loading…</div>}>
      <TasksPageInner />
    </Suspense>
  );
}

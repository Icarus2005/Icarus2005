"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

type Task = {
  id: string;
  title: string;
  notes: string | null;
  dueDate: string | null;
  status: string;
  lead: { id: string; name: string; company: string | null } | null;
  account: { id: string; name: string } | null;
  contact: { id: string; firstName: string; lastName: string } | null;
  opportunity: { id: string; name: string } | null;
};

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filter, setFilter] = useState<"OPEN" | "DONE" | "">("OPEN");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await fetch(`/api/tasks${filter ? `?status=${filter}` : ""}`);
    setTasks(await res.json());
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  async function toggle(task: Task) {
    const newStatus = task.status === "DONE" ? "OPEN" : "DONE";
    // Optimistic update
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: newStatus } : t)));
    await fetch(`/api/tasks/${task.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    load();
  }

  async function remove(id: string) {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    await fetch(`/api/tasks/${id}`, { method: "DELETE" });
  }

  const now = new Date();

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tasks</h1>
          <p className="text-sm text-gray-500 mt-0.5">Follow-ups and reminders</p>
        </div>
        <Link href="/tasks/new" className="btn-primary">+ New Task</Link>
      </div>

      {/* Filter */}
      <div className="flex gap-2 mb-6">
        {([["OPEN", "Open"], ["DONE", "Done"], ["", "All"]] as const).map(([k, label]) => (
          <button
            key={label}
            onClick={() => setFilter(k as "OPEN" | "DONE" | "")}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filter === k ? "bg-brand-600 text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Task list */}
      <div className="space-y-2">
        {loading && <div className="card p-8 text-center text-gray-400">Loading...</div>}
        {!loading && tasks.length === 0 && (
          <div className="card p-10 text-center text-gray-400">
            No tasks here.{" "}
            <Link href="/tasks/new" className="text-brand-600 hover:underline">Create one</Link>
          </div>
        )}
        {tasks.map((task) => {
          const overdue = task.status === "OPEN" && task.dueDate && new Date(task.dueDate) < now;
          return (
            <div key={task.id} className={`card p-4 flex items-start gap-3 ${overdue ? "border-l-4 border-l-red-500" : ""}`}>
              <input
                type="checkbox"
                checked={task.status === "DONE"}
                onChange={() => toggle(task)}
                className="mt-1 w-4 h-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
              />
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${task.status === "DONE" ? "text-gray-400 line-through" : "text-gray-800"}`}>
                  {task.title}
                </p>
                {task.notes && <p className="text-xs text-gray-500 mt-0.5">{task.notes}</p>}
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {task.lead && (
                    <Link href={`/leads/${task.lead.id}`} className="text-xs text-brand-600 hover:underline">
                      Lead: {task.lead.name}{task.lead.company ? ` (${task.lead.company})` : ""}
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
                  {task.contact && (
                    <span className="text-xs text-gray-400">
                      {task.contact.firstName} {task.contact.lastName}
                    </span>
                  )}
                </div>
              </div>
              <div className="text-right shrink-0 flex flex-col items-end gap-1">
                {task.dueDate && (
                  <span className={`text-xs font-medium ${overdue ? "text-red-600" : "text-gray-400"}`}>
                    {overdue ? "Overdue · " : ""}
                    {new Date(task.dueDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                  </span>
                )}
                <button
                  onClick={() => remove(task.id)}
                  className="text-xs text-gray-300 hover:text-red-500 transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, X, Pencil, Pause, Play, Trash2, Users } from "lucide-react";
import { TEAM_ROLES } from "@/lib/constants";

type TeamMember = {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  createdAt: string;
  _count?: { leads: number; opportunities: number; tasks: number };
};

const ROLE_BADGES: Record<string, string> = {
  SALES_DIRECTOR: "bg-violet-100 text-violet-700",
  SALES_EXECUTIVE: "bg-sky-100 text-sky-700",
  VIEWER: "bg-gray-100 text-gray-600",
};

const ROLE_DESCRIPTIONS: Record<string, string> = {
  SALES_DIRECTOR: "Full access — manages team, sees all pipelines and reports",
  SALES_EXECUTIVE: "Works leads, deals, and tasks assigned to them",
  VIEWER: "Read-only access to dashboards and records",
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const AVATAR_COLORS = [
  "bg-brand-500", "bg-emerald-500", "bg-amber-500",
  "bg-rose-500", "bg-violet-500", "bg-cyan-500",
];
function avatarColor(name: string) {
  let hash = 0;
  for (const c of name) hash = (hash * 31 + c.charCodeAt(0)) & 0xffff;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export default function TeamPanel() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<TeamMember | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/team");
    setMembers(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const data = Object.fromEntries(new FormData(e.currentTarget));
    const isEdit = Boolean(editing);
    const res = await fetch(isEdit ? `/api/team/${editing!.id}` : "/api/team", {
      method: isEdit ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      setShowForm(false);
      setEditing(null);
      await load();
    } else {
      const err = await res.json().catch(() => null);
      setError(err?.error ?? "Failed to save team member.");
    }
    setSaving(false);
  }

  async function toggleActive(m: TeamMember) {
    await fetch(`/api/team/${m.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !m.active }),
    });
    await load();
  }

  async function remove(m: TeamMember) {
    const owned = (m._count?.leads ?? 0) + (m._count?.opportunities ?? 0) + (m._count?.tasks ?? 0);
    const msg = owned > 0
      ? `Remove ${m.name}? Their ${owned} assigned record${owned !== 1 ? "s" : ""} will become unassigned.`
      : `Remove ${m.name} from the team?`;
    if (!confirm(msg)) return;
    await fetch(`/api/team/${m.id}`, { method: "DELETE" });
    await load();
  }

  function openEdit(m: TeamMember) {
    setEditing(m);
    setError("");
    setShowForm(true);
  }

  function openAdd() {
    setEditing(null);
    setError("");
    setShowForm(true);
  }

  return (
    <div>
      {/* Team section */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Team Members</h2>
          <p className="text-sm text-gray-500">
            People who can be assigned to leads, deals, and tasks
          </p>
        </div>
        <button onClick={openAdd} className="btn-primary">
<Plus size={16} aria-hidden />
          Add Member
        </button>
      </div>

      {/* Add / Edit form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="card p-6 mb-6 space-y-4 border-brand-200 ring-1 ring-brand-100">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">{editing ? `Edit ${editing.name}` : "New Team Member"}</h3>
            <button
              type="button"
              onClick={() => { setShowForm(false); setEditing(null); }}
              className="text-gray-400 hover:text-gray-600"
            >
<X size={18} aria-hidden />
            </button>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Name *</label>
              <input name="name" required defaultValue={editing?.name ?? ""} className="input" placeholder="Sara Haddad" />
            </div>
            <div>
              <label className="label">Email *</label>
              <input name="email" type="email" required defaultValue={editing?.email ?? ""} className="input" placeholder="sara@arqonelabs.com" />
            </div>
          </div>

          <div>
            <label className="label">Role</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {Object.entries(TEAM_ROLES).map(([k, v]) => (
                <label
                  key={k}
                  className="flex flex-col gap-1 p-3 border border-gray-200 rounded-xl cursor-pointer hover:border-brand-300 has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="role"
                      value={k}
                      defaultChecked={(editing?.role ?? "SALES_EXECUTIVE") === k}
                      className="accent-brand-600"
                    />
                    <span className="text-sm font-medium text-gray-800">{v}</span>
                  </span>
                  <span className="text-xs text-gray-500 leading-snug">{ROLE_DESCRIPTIONS[k]}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => { setShowForm(false); setEditing(null); }}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button type="submit" disabled={saving} className="btn-primary disabled:opacity-60">
              {saving ? "Saving..." : editing ? "Save Changes" : "Add Member"}
            </button>
          </div>
        </form>
      )}

      {/* Member list */}
      <div className="card overflow-hidden divide-y divide-gray-100">
        {loading && <div className="p-8 text-center text-gray-400">Loading team...</div>}
        {!loading && members.length === 0 && (
          <div className="p-10 text-center">
            <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-brand-50 flex items-center justify-center">
              <Users size={22} className="text-brand-500" aria-hidden />
            </div>
            <p className="text-gray-600 font-medium">No team members yet</p>
            <p className="text-sm text-gray-400 mt-1">Add yourself first, then your product teams.</p>
          </div>
        )}
        {members.map((m) => (
          <div key={m.id} className={`flex items-center gap-4 px-5 py-4 ${!m.active ? "opacity-50" : ""}`}>
            <div className={`w-10 h-10 rounded-full ${avatarColor(m.name)} text-white flex items-center justify-center text-sm font-semibold shrink-0`}>
              {initials(m.name)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-medium text-gray-900">{m.name}</p>
                <span className={`badge ${ROLE_BADGES[m.role] ?? "bg-gray-100 text-gray-600"}`}>
                  {TEAM_ROLES[m.role] ?? m.role}
                </span>
                {!m.active && <span className="badge bg-gray-100 text-gray-500">Inactive</span>}
              </div>
              <p className="text-sm text-gray-500 truncate">{m.email}</p>
            </div>
            <div className="hidden sm:flex items-center gap-4 text-xs text-gray-400 shrink-0">
              <span>{m._count?.leads ?? 0} leads</span>
              <span>{m._count?.opportunities ?? 0} deals</span>
              <span>{m._count?.tasks ?? 0} tasks</span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => openEdit(m)}
                className="p-2 text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors"
                title="Edit"
              >
                <Pencil size={15} aria-hidden />
              </button>
              <button
                onClick={() => toggleActive(m)}
                className="p-2 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                title={m.active ? "Deactivate" : "Reactivate"}
              >
                {m.active ? <Pause size={15} aria-hidden /> : <Play size={15} aria-hidden />}
              </button>
              <button
                onClick={() => remove(m)}
                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                title="Remove"
              >
                <Trash2 size={15} aria-hidden />
              </button>
            </div>
          </div>
        ))}
      </div>

    </div>
  );
}

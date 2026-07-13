"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Plus, Check, ChevronsUpDown } from "lucide-react";
import { TEAM_ROLES } from "@/lib/constants";

type TeamMember = {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
};

const STORAGE_KEY = "arqone-crm.currentUserId";

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default function UserSwitcher() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/team")
      .then((r) => r.json())
      .then((list: TeamMember[]) => {
        const active = list.filter((m) => m.active);
        setMembers(active);
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored && active.some((m) => m.id === stored)) {
          setCurrentId(stored);
        } else if (active.length > 0) {
          setCurrentId(active[0].id);
          localStorage.setItem(STORAGE_KEY, active[0].id);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const current = members.find((m) => m.id === currentId);

  function select(id: string) {
    setCurrentId(id);
    localStorage.setItem(STORAGE_KEY, id);
    setOpen(false);
  }

  if (members.length === 0) {
    return (
      <Link
        href="/settings"
        className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 transition-colors group"
      >
        <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/60">
          <Plus size={16} strokeWidth={2} />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-white/80">Set up your team</p>
          <p className="text-[11px] text-white/40">Add members in Settings</p>
        </div>
      </Link>
    );
  }

  return (
    <div className="relative" ref={ref}>
      {open && (
        <div className="absolute bottom-full left-0 right-0 mb-2 bg-brand-900 border border-white/10 rounded-xl shadow-xl overflow-hidden">
          <p className="px-3 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-white/40">
            Working as
          </p>
          {members.map((m) => (
            <button
              key={m.id}
              onClick={() => select(m.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-white/10 transition-colors ${
                m.id === currentId ? "bg-white/5" : ""
              }`}
            >
              <span className="w-6 h-6 rounded-full bg-brand-500 text-white text-[10px] font-semibold flex items-center justify-center shrink-0">
                {initials(m.name)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-medium text-white truncate">{m.name}</span>
                <span className="block text-[10px] text-white/40 truncate">{TEAM_ROLES[m.role] ?? m.role}</span>
              </span>
              {m.id === currentId && (
                <Check size={14} strokeWidth={2.5} className="text-brand-300 shrink-0" />
              )}
            </button>
          ))}
        </div>
      )}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 transition-colors"
      >
        <div className="w-8 h-8 rounded-full bg-brand-500 flex items-center justify-center text-white text-xs font-semibold shrink-0">
          {current ? initials(current.name) : "?"}
        </div>
        <div className="min-w-0 flex-1 text-left">
          <p className="text-xs font-medium text-white truncate">{current?.name ?? "Select user"}</p>
          <p className="text-[11px] text-white/40 truncate">
            {current ? (TEAM_ROLES[current.role] ?? current.role) : ""}
          </p>
        </div>
        <ChevronsUpDown size={14} strokeWidth={2} className="text-white/40 shrink-0" />
      </button>
    </div>
  );
}

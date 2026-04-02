"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: "⬛" },
  { href: "/accounts", label: "Accounts", icon: "🏢" },
  { href: "/contacts", label: "Contacts", icon: "👤" },
  { href: "/opportunities", label: "Pipeline", icon: "📊" },
  { href: "/activities", label: "Activities", icon: "📋" },
  { href: "/import", label: "Import CSV", icon: "📥" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-56 shrink-0 bg-brand-950 flex flex-col min-h-screen">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-brand-900">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-brand-500 rounded-lg flex items-center justify-center text-white font-bold text-sm">
            I
          </div>
          <span className="text-white font-semibold text-sm">IRL Menat CRM</span>
        </div>
        <p className="text-brand-400 text-xs mt-0.5 ml-9">MENAT Sales</p>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {NAV_ITEMS.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                active
                  ? "bg-brand-700 text-white font-medium"
                  : "text-brand-300 hover:bg-brand-900 hover:text-white"
              }`}
            >
              <span className="text-base leading-none">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-brand-900">
        <p className="text-brand-500 text-xs">MENAT Mobility Data &amp; Consulting</p>
      </div>
    </aside>
  );
}

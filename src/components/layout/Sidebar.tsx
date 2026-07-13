"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  LayoutDashboard,
  Crosshair,
  BarChart3,
  Building2,
  Users,
  CheckSquare,
  Clock,
  Upload,
  Settings,
  MapPin,
  GraduationCap,
  Compass,
  Briefcase,
  Inbox,
  type LucideIcon,
} from "lucide-react";
import { BUSINESS_LINES, PRODUCTS_META, isProductKey } from "@/lib/products";
import UserSwitcher from "./UserSwitcher";

type NavItem = { href: string; label: string; icon: LucideIcon; carryProduct?: boolean };

const MAIN_NAV: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, carryProduct: true },
  { href: "/leads", label: "Leads", icon: Crosshair, carryProduct: true },
  { href: "/opportunities", label: "Pipeline", icon: BarChart3, carryProduct: true },
  { href: "/accounts", label: "Accounts", icon: Building2, carryProduct: true },
  { href: "/contacts", label: "Contacts", icon: Users, carryProduct: true },
];

const WORK_NAV: NavItem[] = [
  { href: "/tasks", label: "Tasks", icon: CheckSquare, carryProduct: true },
  { href: "/activities", label: "Activities", icon: Clock, carryProduct: true },
  { href: "/import", label: "Import CSV", icon: Upload },
];

const PRODUCT_ICONS: Record<string, LucideIcon> = {
  PLACEPULSE: MapPin,
  PLYMIO: GraduationCap,
  AI_NAVIGATOR: Compass,
  ADVISORY: Briefcase,
  UNASSIGNED: Inbox,
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-3 pt-5 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-brand-300/40">
      {children}
    </p>
  );
}

function SidebarInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const rawProduct = searchParams.get("product");
  const product = rawProduct && isProductKey(rawProduct) ? rawProduct : null;

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  // Keep the selected product when moving between CRM sections
  const withProduct = (href: string, carry?: boolean) =>
    carry && product ? `${href}?product=${product}` : href;

  return (
    <aside className="w-60 shrink-0 bg-gradient-to-b from-brand-950 via-brand-950 to-[#12143d] flex flex-col min-h-screen">
      {/* Logo */}
      <div className="px-5 py-5">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-gradient-to-br from-brand-400 to-brand-600 rounded-xl flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-brand-900/50">
            A
          </div>
          <div>
            <span className="text-white font-semibold text-sm tracking-tight">ArqOne CRM</span>
            <p className="text-brand-300/50 text-[11px] leading-tight">Sales Platform</p>
          </div>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 pb-4 overflow-y-auto">
        <SectionLabel>Sales</SectionLabel>
        <div className="space-y-0.5">
          {MAIN_NAV.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={withProduct(item.href, item.carryProduct)}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-300 ${
                  active
                    ? "bg-gradient-to-r from-brand-600 to-brand-500 text-white font-medium shadow-lg shadow-brand-900/50"
                    : "text-brand-200/70 hover:bg-white/5 hover:text-white"
                }`}
              >
                <Icon size={17} strokeWidth={1.8} className={active ? "text-white" : "text-brand-300/60"} />
                {item.label}
              </Link>
            );
          })}
        </div>

        <SectionLabel>Workspace</SectionLabel>
        <div className="space-y-0.5">
          {WORK_NAV.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={withProduct(item.href, item.carryProduct)}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-300 ${
                  active
                    ? "bg-gradient-to-r from-brand-600 to-brand-500 text-white font-medium shadow-lg shadow-brand-900/50"
                    : "text-brand-200/70 hover:bg-white/5 hover:text-white"
                }`}
              >
                <Icon size={17} strokeWidth={1.8} className={active ? "text-white" : "text-brand-300/60"} />
                {item.label}
              </Link>
            );
          })}
        </div>

        <SectionLabel>Business Lines</SectionLabel>
        <div className="space-y-0.5">
          {[...BUSINESS_LINES, "UNASSIGNED" as const].map((key) => {
            const meta = PRODUCTS_META[key];
            const Icon = PRODUCT_ICONS[key];
            const href = `/workspace/${meta.slug}`;
            const active = pathname.startsWith(href);
            return (
              <Link
                key={key}
                href={href}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-300 ${
                  active
                    ? "bg-gradient-to-r from-brand-600 to-brand-500 text-white font-medium shadow-lg shadow-brand-900/50"
                    : "text-brand-200/70 hover:bg-white/5 hover:text-white"
                }`}
              >
                <Icon size={17} strokeWidth={1.8} className={active ? "text-white" : "text-brand-300/60"} />
                <span className="flex-1">{meta.label}</span>
                <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} aria-hidden />
              </Link>
            );
          })}
        </div>

        <SectionLabel>System</SectionLabel>
        <div className="space-y-0.5">
          <Link
            href="/settings"
            className={`flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-300 ${
              isActive("/settings")
                ? "bg-gradient-to-r from-brand-600 to-brand-500 text-white font-medium shadow-lg shadow-brand-900/50"
                : "text-brand-200/70 hover:bg-white/5 hover:text-white"
            }`}
          >
            <Settings size={17} strokeWidth={1.8} className={isActive("/settings") ? "text-white" : "text-brand-300/60"} />
            Settings
          </Link>
        </div>
      </nav>

      {/* Current user */}
      <div className="px-3 py-3 border-t border-white/5">
        <UserSwitcher />
      </div>
    </aside>
  );
}

export default function Sidebar() {
  return (
    <Suspense
      fallback={<aside className="w-60 shrink-0 bg-brand-950 min-h-screen" />}
    >
      <SidebarInner />
    </Suspense>
  );
}

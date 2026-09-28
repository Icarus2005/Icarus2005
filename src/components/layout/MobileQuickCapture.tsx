"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Zap } from "lucide-react";

export default function MobileQuickCapture() {
  const pathname = usePathname();
  if (pathname.startsWith("/capture")) return null;
  return <Link href="/capture/quick" className="md:hidden fixed z-40 bottom-4 right-4 rounded-full bg-amber-400 text-brand-950 shadow-xl px-5 py-4 font-bold flex items-center gap-2"><Zap size={19} /> Quick Capture</Link>;
}

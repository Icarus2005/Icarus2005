import Link from "next/link";
import { SearchX } from "lucide-react";

export default function NotFound() {
  return (
    <div className="p-8 flex items-center justify-center min-h-[60vh]">
      <div className="card p-8 max-w-md text-center">
        <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-gray-50 flex items-center justify-center">
          <SearchX size={22} className="text-gray-400" aria-hidden />
        </div>
        <h1 className="text-lg font-semibold text-gray-900">Not found</h1>
        <p className="text-sm text-gray-500 mt-2">
          This record or page doesn&apos;t exist — it may have been removed or the link is out of date.
        </p>
        <div className="flex gap-3 justify-center mt-5">
          <Link href="/" className="btn-primary">Dashboard</Link>
          <Link href="/leads" className="btn-secondary">Leads</Link>
        </div>
      </div>
    </div>
  );
}

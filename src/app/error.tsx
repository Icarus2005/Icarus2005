"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import Link from "next/link";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="p-8 flex items-center justify-center min-h-[60vh]">
      <div className="card p-8 max-w-md text-center">
        <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-red-50 flex items-center justify-center">
          <AlertTriangle size={22} className="text-red-500" aria-hidden />
        </div>
        <h1 className="text-lg font-semibold text-gray-900">Something went wrong</h1>
        <p className="text-sm text-gray-500 mt-2">
          The page hit an unexpected error. Your data is safe — try again, or head back to the dashboard.
        </p>
        {error.digest && (
          <p className="text-xs text-gray-300 mt-2 font-mono">Ref: {error.digest}</p>
        )}
        <div className="flex gap-3 justify-center mt-5">
          <button onClick={reset} className="btn-primary">
            <RotateCcw size={15} aria-hidden /> Try again
          </button>
          <Link href="/" className="btn-secondary">Dashboard</Link>
        </div>
      </div>
    </div>
  );
}

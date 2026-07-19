import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/layout/Sidebar";
import GlobalSearch from "@/components/GlobalSearch";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "ArqOne CRM",
  description:
    "ArqOne sales platform — PlacePulse, Plymio, AI Navigator and Advisory pipelines, leads, and client management",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="flex-1 overflow-auto">
            {children}
          </main>
        </div>
        <GlobalSearch />
      </body>
    </html>
  );
}

import { NextRequest, NextResponse } from "next/server";

/**
 * Stopgap access gate: a single shared password behind HTTP Basic Auth,
 * protecting the whole app until per-user Supabase Auth ships. Any username
 * is accepted — only the password is checked.
 *
 * Set CRM_ACCESS_PASSWORD in the deployment environment to enable it. Unset
 * (e.g. local dev) disables the gate entirely.
 */
export function middleware(req: NextRequest) {
  const password = process.env.CRM_ACCESS_PASSWORD;
  if (!password) return NextResponse.next();

  const header = req.headers.get("authorization");
  if (header?.startsWith("Basic ")) {
    const decoded = Buffer.from(header.slice(6), "base64").toString("utf-8");
    const separatorIndex = decoded.indexOf(":");
    const suppliedPassword = separatorIndex >= 0 ? decoded.slice(separatorIndex + 1) : "";
    if (suppliedPassword === password) return NextResponse.next();
  }

  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="ArqOne CRM"' },
  });
}

export const config = {
  // Protect everything except static assets and the favicon.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

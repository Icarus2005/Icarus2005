export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getPipelines } from "@/lib/catalog";

export async function GET() {
  const pipelines = await getPipelines();
  return NextResponse.json(pipelines);
}

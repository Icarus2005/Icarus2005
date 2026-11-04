import { NextRequest, NextResponse } from "next/server";
import { advanceProposal, runToReview } from "@/lib/proposals/pipeline";

/**
 * Runs the pipeline. `?all=1` runs every automated stage up to the human
 * review gate; otherwise a single stage advances.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const all = searchParams.get("all") === "1";

  try {
    const proposal = all
      ? await runToReview(id)
      : await advanceProposal(id);
    return NextResponse.json(proposal);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Pipeline run failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

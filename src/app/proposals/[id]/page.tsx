export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import ProposalDetail from "./ProposalDetail";

export default async function ProposalPage({ params }: { params: { id: string } }) {
  const proposal = await prisma.proposal.findUnique({
    where: { id: params.id },
    include: {
      account: { select: { id: true, name: true } },
      owner: { select: { id: true, name: true } },
      opportunity: { select: { id: true, name: true } },
      transcript: { select: { id: true, title: true, meetingDate: true, triageScore: true } },
      events: { orderBy: { createdAt: "desc" }, take: 50 },
    },
  });
  if (!proposal) notFound();

  return <ProposalDetail proposal={JSON.parse(JSON.stringify(proposal))} />;
}

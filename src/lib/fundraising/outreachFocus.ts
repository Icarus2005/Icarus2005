import { FUNDRAISING_ROUNDS, type RoundKey } from "./rules";

export type OutreachRoute = {
  id: string;
  status: string;
  priority: string;
  sourceStatus: string;
  firstSentAt: string | null;
  tasks: { id: string; dueDate: string | null }[];
  dispatches: { state: string }[];
};

export function defaultOutreachStep(route: OutreachRoute): "INITIAL" | "FOLLOWUP_1" | "FOLLOWUP_2" | "RESPONSE" {
  if (!route.firstSentAt) return "INITIAL";
  if (["REPLIED", "MEETING", "DILIGENCE", "COMMITTED"].includes(route.status)) return "RESPONSE";
  if (route.tasks.some(t => t.id === `fundraise_${route.id}_1`)) return "FOLLOWUP_1";
  if (route.tasks.some(t => t.id === `fundraise_${route.id}_2`)) return "FOLLOWUP_2";
  return "FOLLOWUP_1";
}

export function newZohoSendBlock(route: OutreachRoute, input: {
  configured: boolean;
  recipient: string | null | undefined;
  crossVentureContacted: boolean;
  kind: string;
  condition: string;
  routeChangesPending: boolean;
}): string | null {
  if (route.dispatches.length) return "Resolve the previous delivery before sending another message.";
  if (route.priority === "Hold" || ["HOLD", "PAUSED", "REJECTED", "COMMITTED"].includes(route.status)) return "This route is not open for new outreach.";
  if (input.routeChangesPending) return "Save contact, status or priority changes before sending.";
  if (route.sourceStatus === "Submitted previously" || route.status === "SUBMITTED_PREVIOUSLY" ||
      input.condition.toLowerCase().includes("original acknowledgement thread")) {
    return "Historical submission: review the original thread. Send the updated introduction there, or use a verified external contact route, then record the actual send.";
  }
  if (input.crossVentureContacted) return "Review the existing conversation for the other venture; do not start a duplicate email.";
  if (input.kind !== "INITIAL" || route.firstSentAt) return "Send in the existing conversation, then record the actual message.";
  if (!input.configured) return "Zoho sending is not configured.";
  if (!input.recipient) return "Link and save a verified CRM contact to enable Zoho sending.";
  return null;
}

/** Neutral editable starting point, never represents research or verified investor interest. */
export function betaIntroduction(roundKey: RoundKey) {
  const round = FUNDRAISING_ROUNDS[roundKey];
  const amount = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(round.targetUsd);
  const description = roundKey === "brandsprk-preseed-2026"
    ? "an AI-powered brand and creative decision platform for SMEs, boutique agencies and brands"
    : "an AI-powered location decision intelligence platform that brings together evidence from multiple sources";
  return {
    subject: `${round.label} | Pre-seed investment introduction`,
    body: `Hello,\n\nI'm the founder of ArqOne Labs, a Dubai-based AI venture studio. We're building ${round.label}, ${description}.\n\nThe platform is live in beta, and we're exploring a ${amount} pre-seed round. You can review the investment proposition and ask my AI representative initial questions here:\n\n${round.briefingUrl}\n\nI'd welcome a conversation to explore whether the venture fits your investment focus.\n\nBest regards,\nPiero Saleme`,
  };
}

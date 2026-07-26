/**
 * Kinds of entry in the proposal knowledge base ("the binder").
 *
 * Lives outside the route files because Next.js route modules may only export
 * HTTP handlers — a stray named export breaks the build.
 */
export const KNOWLEDGE_KINDS = [
  "SERVICE_CATALOG",
  "TEMPLATE",
  "BRAND",
  "WINNING_EXAMPLE",
] as const;

export type KnowledgeKind = (typeof KNOWLEDGE_KINDS)[number];

export function isKnowledgeKind(v: string): v is KnowledgeKind {
  return (KNOWLEDGE_KINDS as readonly string[]).includes(v);
}

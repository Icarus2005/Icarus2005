import { ACTIVITY_TYPES } from "./constants";

// Pure, DB-free validation — kept separate from the API route so it can be
// unit tested directly without a database.

export function isValidActivityType(type: unknown): type is string {
  return typeof type === "string" && type in ACTIVITY_TYPES;
}

export type ActivityRelationIds = {
  accountId?: string | null;
  contactId?: string | null;
  leadId?: string | null;
  opportunityId?: string | null;
};

/** Extracts only the relation-id fields that were actually supplied (non-empty). */
export function suppliedRelationIds(body: ActivityRelationIds): { field: keyof ActivityRelationIds; id: string }[] {
  const fields: (keyof ActivityRelationIds)[] = ["accountId", "contactId", "leadId", "opportunityId"];
  return fields
    .filter((f) => typeof body[f] === "string" && (body[f] as string).length > 0)
    .map((f) => ({ field: f, id: body[f] as string }));
}

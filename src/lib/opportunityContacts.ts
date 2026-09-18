import { prisma } from "./prisma";

// OpportunityContact.isPrimary is the sole source of truth for an
// opportunity's primary contact — never add a competing primaryContactId
// field on Opportunity itself. This helper is the only place that should
// write isPrimary, so "at most one primary per opportunity" stays enforced
// even though Postgres has no partial-unique-index equivalent in the
// current additive migration.
export async function setPrimaryContact(opportunityId: string, contactId: string): Promise<void> {
  await prisma.$transaction([
    prisma.opportunityContact.updateMany({
      where: { opportunityId, isPrimary: true },
      data: { isPrimary: false },
    }),
    prisma.opportunityContact.upsert({
      where: { opportunityId_contactId: { opportunityId, contactId } },
      create: { opportunityId, contactId, isPrimary: true },
      update: { isPrimary: true },
    }),
  ]);
}

export function derivePrimaryContact<T extends { isPrimary: boolean }>(
  contacts: T[]
): T | null {
  return contacts.find((c) => c.isPrimary) ?? null;
}

// Pure planning logic for the Contacts CSV import — no database access, so
// it can be unit tested directly. src/app/api/import/contacts/route.ts
// fetches the account map and existing-email map from the database, then
// hands both to `planContactImport` to decide what to do with each row.

export type ContactImportRow = Record<string, string>;

export type ExistingContact = { id: string; firstName: string; lastName: string };

export type ContactCreateData = {
  firstName: string;
  lastName: string;
  accountId: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  role: string | null;
};

export type ContactPlanItem =
  | { row: number; outcome: "create"; data: ContactCreateData }
  | { row: number; outcome: "error"; message: string }
  | { row: number; outcome: "duplicate"; message: string };

/**
 * Decide what to do with every row before touching the database. Contacts
 * are matched by email: a match against an existing contact, or against an
 * earlier row in the same file, is reported as a clear "duplicate" outcome
 * and never silently dropped or turned into a second person.
 */
export function planContactImport(
  rows: ContactImportRow[],
  accountMap: Map<string, string>, // lower-cased account name -> account id
  existingByEmail: Map<string, ExistingContact> // lower-cased email -> existing contact
): ContactPlanItem[] {
  const plan: ContactPlanItem[] = [];
  const seenInBatch = new Map<string, number>(); // lower-cased email -> row number

  rows.forEach((row, i) => {
    const rowNum = i + 2; // header is row 1
    const firstName = row.firstName?.trim();
    const lastName = row.lastName?.trim();
    if (!firstName || !lastName) {
      plan.push({ row: rowNum, outcome: "error", message: `Row ${rowNum} skipped: missing firstName or lastName` });
      return;
    }

    const accountName = row.accountName?.trim();
    const accountId = accountName ? accountMap.get(accountName.toLowerCase()) : undefined;
    if (accountName && !accountId) {
      plan.push({
        row: rowNum,
        outcome: "error",
        message: `Contact "${firstName} ${lastName}" skipped: account "${accountName}" not found — import accounts first`,
      });
      return;
    }
    if (!accountId) {
      plan.push({
        row: rowNum,
        outcome: "error",
        message: `Contact "${firstName} ${lastName}" skipped: accountName is required`,
      });
      return;
    }

    const email = row.email?.trim() || null;
    if (email) {
      const key = email.toLowerCase();
      const existing = existingByEmail.get(key);
      if (existing) {
        plan.push({
          row: rowNum,
          outcome: "duplicate",
          message: `Contact "${firstName} ${lastName}" skipped: email ${email} already belongs to ${existing.firstName} ${existing.lastName} (id ${existing.id}) — not duplicated.`,
        });
        return;
      }
      const dupRow = seenInBatch.get(key);
      if (dupRow != null) {
        plan.push({
          row: rowNum,
          outcome: "duplicate",
          message: `Contact "${firstName} ${lastName}" skipped: email ${email} is duplicated within this file (first seen at row ${dupRow}) — only the first occurrence is imported.`,
        });
        return;
      }
      seenInBatch.set(key, rowNum);
    }

    plan.push({
      row: rowNum,
      outcome: "create",
      data: {
        firstName,
        lastName,
        accountId,
        email,
        phone: row.phone?.trim() || null,
        title: row.title?.trim() || null,
        role: row.role?.trim() || null,
      },
    });
  });

  return plan;
}

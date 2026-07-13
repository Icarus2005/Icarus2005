import type { Prisma } from "@prisma/client";
import { isProductKey } from "./products";

/** Validated product param or empty string. */
export function cleanProduct(v: string | null | undefined): string {
  return v && isProductKey(v) ? v : "";
}

/** Where clause for Lead product filtering (primary product only — secondary
 *  interests never affect the primary pipeline/forecast views). */
export function leadProductWhere(product: string): Prisma.LeadWhereInput {
  if (!product) return {};
  return { primaryProduct: product };
}

/** Where clause for Opportunity product filtering. */
export function oppProductWhere(product: string): Prisma.OpportunityWhereInput {
  if (!product) return {};
  return { product };
}

/**
 * Where clause matching a task's *inherited* product:
 * opportunity product → lead primary product → own product field.
 */
export function taskProductWhere(product: string): Prisma.TaskWhereInput {
  if (!product) return {};
  const or: Prisma.TaskWhereInput[] = [
    { opportunity: { product } },
    { opportunityId: null, lead: { primaryProduct: product } },
    { opportunityId: null, leadId: null, product },
  ];
  if (product === "UNASSIGNED") {
    or.push({ opportunityId: null, leadId: null, product: null });
  }
  return { OR: or };
}

/** Same inheritance rule for activities. */
export function activityProductWhere(product: string): Prisma.ActivityWhereInput {
  if (!product) return {};
  const or: Prisma.ActivityWhereInput[] = [
    { opportunity: { product } },
    { opportunityId: null, lead: { primaryProduct: product } },
    { opportunityId: null, leadId: null, product },
  ];
  if (product === "UNASSIGNED") {
    or.push({ opportunityId: null, leadId: null, product: null });
  }
  return { OR: or };
}

/** Accounts participating in a product (via opportunities or open leads). */
export function accountProductWhere(product: string): Prisma.AccountWhereInput {
  if (!product) return {};
  return { opportunities: { some: { product } } };
}

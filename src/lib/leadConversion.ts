import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "./prisma";
import { isProductKey, productLabel } from "./products";

type DbClient = Prisma.TransactionClient;

export type LeadConversionInput = {
  name?: string;
  value?: number;
  ownerId?: string;
  nextTaskTitle?: string;
  nextTaskDueDate?: string | Date | null;
  secondaries?: Array<{ product: string; name?: string; value?: number }>;
};

export type LeadConversionResult = {
  accountId: string;
  contactId: string;
  opportunityId: string;
  pipelineId: string | null;
  stage: string;
  taskId: string;
  secondaryOpportunities: Array<{ id: string; product: string }>;
  replay: boolean;
};

export class LeadConversionError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "LeadConversionError";
  }
}

function validateInput(input: LeadConversionInput) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new LeadConversionError("Conversion request is invalid", 400);
  }
  for (const field of ["name", "ownerId", "nextTaskTitle"] as const) {
    if (input[field] !== undefined && typeof input[field] !== "string") {
      throw new LeadConversionError(`Conversion field ${field} is invalid`, 400);
    }
  }
  if (input.nextTaskDueDate !== undefined && input.nextTaskDueDate !== null &&
      typeof input.nextTaskDueDate !== "string" && !(input.nextTaskDueDate instanceof Date)) {
    throw new LeadConversionError("Next-task date is invalid", 400);
  }
  if (input.value !== undefined && typeof input.value !== "number" && typeof input.value !== "string") {
    throw new LeadConversionError("Opportunity value is invalid", 400);
  }
  if (input.secondaries !== undefined && !Array.isArray(input.secondaries)) {
    throw new LeadConversionError("Secondary opportunities are invalid", 400);
  }
  for (const secondary of input.secondaries ?? []) {
    if (!secondary || typeof secondary !== "object" || typeof secondary.product !== "string" ||
        (secondary.name !== undefined && typeof secondary.name !== "string") ||
        (secondary.value !== undefined && typeof secondary.value !== "number" && typeof secondary.value !== "string")) {
      throw new LeadConversionError("Secondary opportunities are invalid", 400);
    }
  }
}

function optionalMoney(value: unknown, fallback: number | null): number | null {
  if (value === undefined || value === null || value === "") return fallback;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new LeadConversionError("Opportunity value must be a non-negative number", 400);
  }
  return number;
}

function optionalDate(value: string | Date | null | undefined, fallback: Date | null): Date | null {
  if (value === undefined || value === null || value === "") return fallback;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new LeadConversionError("Next-task date is invalid", 400);
  }
  return date;
}

function canonicalOpenTask<T extends { dueDate: Date | null; createdAt: Date }>(tasks: T[]): T | null {
  return [...tasks].sort((a, b) => {
    if (a.dueDate && b.dueDate) return a.dueDate.getTime() - b.dueDate.getTime();
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return a.createdAt.getTime() - b.createdAt.getTime();
  })[0] ?? null;
}

async function lockKey(tx: DbClient, namespace: string, value: string) {
  await tx.$queryRaw<Array<{ locked: boolean }>>`
    SELECT true AS "locked"
    FROM pg_advisory_xact_lock(hashtext(${`${namespace}:${value.trim().toLowerCase()}`}))
  `;
}

async function pipelineFor(tx: DbClient, product: string) {
  const pipeline = await tx.pipeline.findFirst({
    where: { productKey: product, active: true },
    include: {
      stages: {
        where: { active: true, isWon: false, isLost: false },
        orderBy: { order: "asc" },
      },
    },
    orderBy: [{ isDefault: "desc" }, { id: "asc" }],
  });
  if (!pipeline || !pipeline.stages[0]) {
    throw new LeadConversionError(`No active conversion pipeline is configured for ${productLabel(product)}`, 409);
  }
  return { pipeline, initialStage: pipeline.stages[0] };
}

async function runConversion(
  client: PrismaClient,
  leadId: string,
  input: LeadConversionInput
): Promise<LeadConversionResult> {
  return client.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "Lead" WHERE "id" = ${leadId} FOR UPDATE
    `;
    if (locked.length === 0) throw new LeadConversionError("Lead not found", 404);

    const lead = await tx.lead.findUniqueOrThrow({
      where: { id: leadId },
      include: {
        account: true,
        primaryContact: { include: { account: true } },
        tasks: { where: { status: "OPEN" }, orderBy: { createdAt: "asc" } },
      },
    });

    if (lead.convertedOpportunityId) {
      const existing = await tx.opportunity.findUnique({
        where: { id: lead.convertedOpportunityId },
        include: {
          contacts: { where: { isPrimary: true }, take: 1 },
          tasks: { where: { status: "OPEN" }, orderBy: { dueDate: "asc" }, take: 1 },
        },
      });
      if (!existing) {
        throw new LeadConversionError("This lead references a converted opportunity that no longer exists", 409);
      }
      const contactId = existing.contacts[0]?.contactId ?? lead.primaryContactId;
      const taskId = existing.tasks[0]?.id;
      if (!contactId || !taskId) {
        throw new LeadConversionError("The existing conversion is missing its primary contact or next task", 409);
      }
      return {
        accountId: existing.accountId,
        contactId,
        opportunityId: existing.id,
        pipelineId: existing.pipelineId,
        stage: existing.stage,
        taskId,
        secondaryOpportunities: [],
        replay: true,
      };
    }

    if (!isProductKey(lead.primaryProduct) || lead.primaryProduct === "UNASSIGNED") {
      throw new LeadConversionError("Assign a primary product before converting this lead", 400);
    }

    const ownerId = input.ownerId ?? lead.ownerId;
    if (input.ownerId) {
      const owner = await tx.teamMember.findUnique({ where: { id: input.ownerId } });
      if (!owner?.active) throw new LeadConversionError("Select an active opportunity owner", 400);
    }

    const allowedSecondaries = new Set(
      (lead.secondaryProducts ?? "").split(",").map((value) => value.trim()).filter(Boolean)
    );
    const secondaries = input.secondaries ?? [];
    const seenProducts = new Set<string>();
    for (const secondary of secondaries) {
      if (
        !isProductKey(secondary.product) ||
        secondary.product === "UNASSIGNED" ||
        secondary.product === lead.primaryProduct ||
        !allowedSecondaries.has(secondary.product) ||
        seenProducts.has(secondary.product)
      ) {
        throw new LeadConversionError("One or more secondary opportunities are not valid for this lead", 400);
      }
      optionalMoney(secondary.value, null);
      seenProducts.add(secondary.product);
    }

    const existingTask = canonicalOpenTask(lead.tasks);
    const nextTaskTitle = existingTask?.title ?? input.nextTaskTitle?.trim() ?? lead.nextAction?.trim();
    if (!nextTaskTitle) {
      throw new LeadConversionError("Add a next task before converting this qualified lead", 400);
    }
    const nextTaskDueDate = existingTask?.dueDate ?? optionalDate(input.nextTaskDueDate, lead.nextActionDate);

    let contact = lead.primaryContact;
    if (!contact && lead.email?.trim()) {
      const email = lead.email.trim();
      await lockKey(tx, "contact-email", email);
      const matches = await tx.contact.findMany({
        where: { email: { equals: email, mode: "insensitive" } },
        include: { account: true },
        take: 2,
      });
      if (matches.length > 1) {
        throw new LeadConversionError("Multiple contacts match this lead email; review them before conversion", 409);
      }
      contact = matches[0] ?? null;
    }

    let account = lead.account;
    if (account && contact && account.id !== contact.accountId) {
      throw new LeadConversionError("The lead account and primary contact belong to different accounts", 409);
    }
    if (!account && contact) account = contact.account;

    const companyName = lead.company?.trim() || lead.name.trim();
    if (!account) {
      await lockKey(tx, "account-name", companyName);
      const matches = await tx.account.findMany({
        where: { name: { equals: companyName, mode: "insensitive" } },
        take: 2,
      });
      if (matches.length > 1) {
        throw new LeadConversionError("Multiple accounts match this company; review them before conversion", 409);
      }
      account = matches[0] ?? await tx.account.create({
        data: {
          name: companyName,
          country: lead.markets.split(",")[0]?.trim() || "AE",
          industry: lead.sector,
          description: lead.notes,
          ownerId: lead.ownerId,
        },
      });
    }

    if (contact && contact.accountId !== account.id) {
      throw new LeadConversionError("The matched contact belongs to a different account", 409);
    }
    if (!contact) {
      const parts = lead.name.trim().split(/\s+/);
      contact = await tx.contact.create({
        data: {
          firstName: parts[0] || lead.name,
          lastName: parts.slice(1).join(" ") || "-",
          email: lead.email?.trim() || null,
          phone: lead.phone,
          title: lead.title,
          sourceType: lead.sourceType,
          sourceDetail: lead.sourceDetail,
          accountId: account.id,
        },
        include: { account: true },
      });
    }

    const carryNotes = [
      lead.notes ? `From lead: ${lead.notes}` : "",
      lead.sourceType || lead.source
        ? `Source: ${lead.sourceType ?? lead.source}${lead.sourceDetail ? ` (${lead.sourceDetail})` : ""}`
        : "",
      lead.salesMotion ? `Sales motion: ${lead.salesMotion}` : "",
      lead.tags ? `Tags: ${lead.tags}` : "",
    ].filter(Boolean).join("\n") || null;
    const resolvedAccount = account;
    const resolvedContact = contact;

    async function createOpportunity(product: string, name: string, value: number | null) {
      const { pipeline, initialStage } = await pipelineFor(tx, product);
      return tx.opportunity.create({
        data: {
          name,
          product,
          pipelineId: pipeline.id,
          stageId: initialStage.id,
          stage: initialStage.key,
          probability: initialStage.defaultProbability,
          value,
          markets: lead.markets,
          useCase: lead.useCase,
          ownerId,
          accountId: resolvedAccount.id,
          nextAction: nextTaskTitle,
          nextActionDate: nextTaskDueDate,
          notes: carryNotes,
          contacts: { create: { contactId: resolvedContact.id, isPrimary: true } },
        },
      });
    }

    const primaryName = input.name?.trim() || `${productLabel(lead.primaryProduct)} — ${companyName}`;
    const primary = await createOpportunity(
      lead.primaryProduct,
      primaryName,
      optionalMoney(input.value, lead.estimatedValue)
    );

    const createdSecondaries: Array<{ id: string; product: string }> = [];
    for (const secondary of secondaries) {
      const opportunity = await createOpportunity(
        secondary.product,
        secondary.name?.trim() || `${productLabel(secondary.product)} — ${companyName}`,
        optionalMoney(secondary.value, null)
      );
      createdSecondaries.push({ id: opportunity.id, product: opportunity.product });
    }

    const task = existingTask
      ? await tx.task.update({
          where: { id: existingTask.id },
          data: {
            opportunityId: primary.id,
            accountId: account.id,
            contactId: contact.id,
            product: lead.primaryProduct,
            ownerId: existingTask.ownerId ?? ownerId,
          },
        })
      : await tx.task.create({
          data: {
            title: nextTaskTitle,
            dueDate: nextTaskDueDate,
            status: "OPEN",
            priority: "HIGH",
            product: lead.primaryProduct,
            leadId: lead.id,
            accountId: account.id,
            contactId: contact.id,
            opportunityId: primary.id,
            ownerId,
          },
        });

    await tx.lead.update({
      where: { id: lead.id },
      data: {
        status: "QUALIFIED",
        convertedOpportunityId: primary.id,
        accountId: account.id,
        primaryContactId: contact.id,
      },
    });

    return {
      accountId: account.id,
      contactId: contact.id,
      opportunityId: primary.id,
      pipelineId: primary.pipelineId,
      stage: primary.stage,
      taskId: task.id,
      secondaryOpportunities: createdSecondaries,
      replay: false,
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5_000, timeout: 20_000 });
}

export async function convertLeadToOpportunity(
  leadId: string,
  input: LeadConversionInput,
  client: PrismaClient = prisma
): Promise<LeadConversionResult> {
  validateInput(input);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await runConversion(client, leadId, input);
    } catch (error) {
      if (error instanceof LeadConversionError) throw error;
      if (error instanceof Prisma.PrismaClientKnownRequestError && attempt < 2) {
        const databaseCode = typeof error.meta?.code === "string" ? error.meta.code : null;
        if (error.code === "P2034" || databaseCode === "40001") continue;
      }
      throw error;
    }
  }
  throw new Error("Lead conversion retry limit exceeded");
}

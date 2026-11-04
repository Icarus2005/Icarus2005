import { prisma } from "./prisma";
import { CRM_HEALTH_THRESHOLDS, isOlderThanDays, isOpenOpportunityRecord, latestActivityDate, type CrmHealthThresholds } from "./crmHealth";
import { addDubaiDays, isOverdueDubai, startOfDubaiDay } from "./dubaiTime";
import { deriveNextInteraction, type NextInteraction } from "./nextInteraction";
import { leadProductWhere, oppProductWhere, taskProductWhere } from "./filters";

type DateValue = Date | string;
type ActivityRef = { date: DateValue };
type OpenTaskRef = {
  id: string;
  title: string;
  dueDate: DateValue | null;
  clientCommitmentDate: DateValue | null;
  status: string;
  priority: string;
};

type RelatedRecord = { id: string; name: string };

export type DailyActionDashboardInput = {
  leads: Array<{
    id: string;
    name: string;
    company: string | null;
    status: string;
    primaryProduct: string;
    convertedOpportunityId: string | null;
    nextAction: string | null;
    nextActionDate: DateValue | null;
    createdAt: DateValue;
    activities: ActivityRef[];
    tasks: OpenTaskRef[];
  }>;
  opportunities: Array<{
    id: string;
    name: string;
    product: string;
    stage: string;
    stageRef: { name: string; isWon: boolean; isLost: boolean } | null;
    healthStatus: string;
    value: number | null;
    probability: number | null;
    forecastCategory: string;
    nextAction: string | null;
    nextActionDate: DateValue | null;
    expectedCloseDate: DateValue | null;
    closedAt: DateValue | null;
    account: RelatedRecord;
    activities: ActivityRef[];
    tasks: OpenTaskRef[];
  }>;
  tasks: Array<OpenTaskRef & {
    product: string | null;
    lead: (RelatedRecord & { primaryProduct: string }) | null;
    opportunity: (RelatedRecord & { product: string }) | null;
    account: RelatedRecord | null;
    contact: { id: string; firstName: string; lastName: string } | null;
  }>;
  meetings: Array<{
    id: string;
    title: string;
    meetingDate: DateValue;
    detectedProduct: string | null;
    account: RelatedRecord | null;
    contact: { id: string; firstName: string; lastName: string } | null;
    lead: (RelatedRecord & { primaryProduct: string }) | null;
  }>;
};

export type TodayAction = {
  key: string;
  timing: "overdue" | "today" | "missing";
  label: string;
  context: string | null;
  date: DateValue | null;
  priority: string;
  product: string;
  href: string;
  actionHref: string;
  actionLabel: string;
  explanation: string;
};

export type AtRiskItem = {
  key: string;
  entity: "lead" | "opportunity";
  label: string;
  context: string | null;
  product: string;
  href: string;
  reasons: string[];
  actionHref: string;
  actionLabel: string;
  nextInteraction: NextInteraction;
  rank: number;
};

export type UpcomingItem = {
  key: string;
  type: "task" | "commitment" | "meeting" | "close";
  label: string;
  context: string | null;
  product: string;
  date: DateValue;
  href: string;
  explanation: string;
};

export type PipelineMetrics = {
  activeLeads: number;
  openOpportunities: number;
  pipelineValue: number;
  weightedValue: number;
  commitValue: number;
  stages: Array<{ key: string; name: string; count: number; value: number }>;
};

const priorityRank: Record<string, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

function taskProduct(task: DailyActionDashboardInput["tasks"][number]): string {
  return task.opportunity?.product ?? task.lead?.primaryProduct ?? task.product ?? "UNASSIGNED";
}

function taskContext(task: DailyActionDashboardInput["tasks"][number]) {
  if (task.lead) return { label: task.lead.name, href: `/leads/${task.lead.id}` };
  if (task.opportunity) return { label: task.opportunity.name, href: `/opportunities/${task.opportunity.id}` };
  if (task.contact) return { label: `${task.contact.firstName} ${task.contact.lastName}`, href: `/contacts/${task.contact.id}` };
  if (task.account) return { label: task.account.name, href: `/accounts/${task.account.id}` };
  return { label: null, href: "/tasks" };
}

function isOnDubaiDay(value: DateValue, dayStart: Date, nextDayStart: Date): boolean {
  const time = new Date(value).getTime();
  return time >= dayStart.getTime() && time < nextDayStart.getTime();
}

function within(value: DateValue, start: Date, end: Date): boolean {
  const time = new Date(value).getTime();
  return time >= start.getTime() && time < end.getTime();
}

function dateTime(value: DateValue | null): number {
  return value ? new Date(value).getTime() : Number.MAX_SAFE_INTEGER;
}

export function buildDailyActionDashboard(
  input: DailyActionDashboardInput,
  now = new Date(),
  thresholds: CrmHealthThresholds = CRM_HEALTH_THRESHOLDS
) {
  const todayStart = startOfDubaiDay(now);
  const tomorrowStart = addDubaiDays(todayStart, 1);
  const upcomingEnd = addDubaiDays(todayStart, thresholds.upcomingCommitmentDays + 1);
  const openTasks = input.tasks.filter((task) => task.status === "OPEN");

  const taskActions: TodayAction[] = openTasks
    .filter((task) => task.dueDate && (isOverdueDubai(task.dueDate, now) || isOnDubaiDay(task.dueDate, todayStart, tomorrowStart)))
    .map((task) => {
      const context = taskContext(task);
      const overdue = isOverdueDubai(task.dueDate, now);
      return {
        key: `task:${task.id}`,
        timing: overdue ? "overdue" as const : "today" as const,
        label: task.title,
        context: context.label,
        date: task.dueDate,
        priority: task.priority,
        product: taskProduct(task),
        href: context.href,
        actionHref: "/tasks",
        actionLabel: "Review task",
        explanation: overdue ? "The Dubai due date has passed." : "Due today in Dubai.",
      };
    });

  const qualifiedWithoutTasks: TodayAction[] = input.leads
    .filter((lead) => lead.status === "QUALIFIED" && !lead.convertedOpportunityId && !lead.tasks.some((task) => task.status === "OPEN"))
    .map((lead) => ({
      key: `lead-next-task:${lead.id}`,
      timing: "missing" as const,
      label: lead.name,
      context: lead.company,
      date: null,
      priority: "HIGH",
      product: lead.primaryProduct,
      href: `/leads/${lead.id}`,
      actionHref: `/tasks/new?leadId=${lead.id}&product=${lead.primaryProduct}`,
      actionLabel: "Add next task",
      explanation: "Qualified Lead with no canonical open next Task.",
    }));

  const timingRank = { overdue: 0, today: 1, missing: 2 } as const;
  const today = [...taskActions, ...qualifiedWithoutTasks].sort((a, b) =>
    timingRank[a.timing] - timingRank[b.timing] ||
    (priorityRank[a.priority] ?? 4) - (priorityRank[b.priority] ?? 4) ||
    dateTime(a.date) - dateTime(b.date) ||
    a.label.localeCompare(b.label)
  );

  const atRiskOpportunities: AtRiskItem[] = input.opportunities
    .filter(isOpenOpportunityRecord)
    .flatMap((opportunity) => {
      const reasons: string[] = [];
      let rank = 0;
      const latest = latestActivityDate(opportunity.activities);
      const inactive = !latest || isOlderThanDays(latest, thresholds.recentOpportunityActivityDays, now);
      if (inactive) {
        reasons.push(latest
          ? `No Activity in ${thresholds.recentOpportunityActivityDays}+ days; last recorded ${latest.toISOString().slice(0, 10)}.`
          : "No Activity has been recorded.");
        rank += 3;
      }
      const tasks = opportunity.tasks.filter((task) => task.status === "OPEN");
      const nextInteraction = deriveNextInteraction(tasks, opportunity.nextAction, opportunity.nextActionDate);
      const missingCanonicalTask = tasks.length === 0;
      if (missingCanonicalTask) {
        reasons.push(nextInteraction?.source === "field"
          ? "No open Task; only the legacy next-action note remains."
          : "No next action is recorded.");
        rank += 4;
      }
      if (opportunity.healthStatus === "AT_RISK" || opportunity.healthStatus === "STALLED") {
        reasons.push(`Explicitly marked ${opportunity.healthStatus === "STALLED" ? "Stalled" : "At Risk"}.`);
        rank += 2;
      }
      if (reasons.length === 0) return [];
      return [{
        key: `opportunity:${opportunity.id}`,
        entity: "opportunity" as const,
        label: opportunity.name,
        context: opportunity.account.name,
        product: opportunity.product,
        href: `/opportunities/${opportunity.id}`,
        reasons,
        actionHref: missingCanonicalTask
          ? `/tasks/new?opportunityId=${opportunity.id}&product=${opportunity.product}`
          : inactive
            ? `/activities/new?opportunityId=${opportunity.id}&product=${opportunity.product}`
            : `/opportunities/${opportunity.id}`,
        actionLabel: missingCanonicalTask ? "Add next task" : inactive ? "Log activity" : "Review deal",
        nextInteraction,
        rank,
      }];
    });

  const atRiskLeads: AtRiskItem[] = input.leads
    .filter((lead) => lead.status !== "DISQUALIFIED" && !lead.convertedOpportunityId)
    .flatMap((lead) => {
      const reasons: string[] = [];
      let rank = 0;
      const qualifiedWithoutOpportunity = lead.status === "QUALIFIED";
      if (qualifiedWithoutOpportunity) {
        reasons.push("Qualified Lead has no Opportunity.");
        rank += 5;
      }
      const latest = latestActivityDate(lead.activities);
      const cooling = isOlderThanDays(latest ?? lead.createdAt, thresholds.staleLeadDays, now);
      if (cooling) {
        reasons.push(latest
          ? `No Activity in ${thresholds.staleLeadDays}+ days; last recorded ${latest.toISOString().slice(0, 10)}.`
          : `No Activity in ${thresholds.staleLeadDays}+ days since creation.`);
        rank += 3;
      }
      const tasks = lead.tasks.filter((task) => task.status === "OPEN");
      const nextInteraction = deriveNextInteraction(tasks, lead.nextAction, lead.nextActionDate);
      const missingCanonicalTask = lead.status === "QUALIFIED" && tasks.length === 0;
      if (missingCanonicalTask) {
        reasons.push(nextInteraction?.source === "field"
          ? "No open Task; only the legacy next-action note remains."
          : "No next action is recorded.");
        rank += 4;
      }
      if (reasons.length === 0) return [];
      return [{
        key: `lead:${lead.id}`,
        entity: "lead" as const,
        label: lead.name,
        context: lead.company,
        product: lead.primaryProduct,
        href: `/leads/${lead.id}`,
        reasons,
        actionHref: qualifiedWithoutOpportunity
          ? `/leads/${lead.id}/convert`
          : missingCanonicalTask
            ? `/tasks/new?leadId=${lead.id}&product=${lead.primaryProduct}`
            : `/activities/new?leadId=${lead.id}&product=${lead.primaryProduct}`,
        actionLabel: qualifiedWithoutOpportunity ? "Review conversion" : missingCanonicalTask ? "Add next task" : "Log activity",
        nextInteraction,
        rank,
      }];
    });

  const atRisk = [...atRiskLeads, ...atRiskOpportunities].sort((a, b) =>
    b.rank - a.rank || a.label.localeCompare(b.label)
  );

  const upcomingTasks: UpcomingItem[] = openTasks
    .filter((task) => task.dueDate && within(task.dueDate, tomorrowStart, upcomingEnd))
    .map((task) => {
      const context = taskContext(task);
      return {
        key: `task-due:${task.id}`,
        type: "task" as const,
        label: task.title,
        context: context.label,
        product: taskProduct(task),
        date: task.dueDate!,
        href: context.href,
        explanation: "Internal follow-up target.",
      };
    });

  const upcomingCommitments: UpcomingItem[] = openTasks
    .filter((task) => task.clientCommitmentDate && within(task.clientCommitmentDate, todayStart, upcomingEnd))
    .map((task) => {
      const context = taskContext(task);
      return {
        key: `client-commitment:${task.id}`,
        type: "commitment" as const,
        label: task.title,
        context: context.label,
        product: taskProduct(task),
        date: task.clientCommitmentDate!,
        href: context.href,
        explanation: "Recorded client commitment date.",
      };
    });

  const upcomingMeetings: UpcomingItem[] = input.meetings
    .filter((meeting) => within(meeting.meetingDate, todayStart, upcomingEnd))
    .map((meeting) => {
      const related = meeting.lead
        ? { label: meeting.lead.name, href: `/leads/${meeting.lead.id}` }
        : meeting.contact
          ? { label: `${meeting.contact.firstName} ${meeting.contact.lastName}`, href: `/contacts/${meeting.contact.id}` }
          : meeting.account
            ? { label: meeting.account.name, href: `/accounts/${meeting.account.id}` }
            : { label: null, href: "/meetings" };
      return {
        key: `meeting:${meeting.id}`,
        type: "meeting" as const,
        label: meeting.title,
        context: related.label,
        product: meeting.detectedProduct ?? meeting.lead?.primaryProduct ?? "UNASSIGNED",
        date: meeting.meetingDate,
        href: related.href,
        explanation: "Meeting date recorded in CRM.",
      };
    });

  const upcomingCloses: UpcomingItem[] = input.opportunities
    .filter((opportunity) => isOpenOpportunityRecord(opportunity) && opportunity.expectedCloseDate && within(opportunity.expectedCloseDate, todayStart, upcomingEnd))
    .map((opportunity) => ({
      key: `close:${opportunity.id}`,
      type: "close" as const,
      label: opportunity.name,
      context: opportunity.account.name,
      product: opportunity.product,
      date: opportunity.expectedCloseDate!,
      href: `/opportunities/${opportunity.id}`,
      explanation: "Expected close date recorded on the Opportunity.",
    }));

  const typeRank = { commitment: 0, meeting: 1, task: 2, close: 3 } as const;
  const upcoming = [...upcomingTasks, ...upcomingCommitments, ...upcomingMeetings, ...upcomingCloses].sort((a, b) =>
    dateTime(a.date) - dateTime(b.date) || typeRank[a.type] - typeRank[b.type] || a.label.localeCompare(b.label)
  );

  const openOpportunities = input.opportunities.filter(isOpenOpportunityRecord);
  const stageMap = new Map<string, { name: string; count: number; value: number }>();
  for (const opportunity of openOpportunities) {
    const current = stageMap.get(opportunity.stage) ?? {
      name: opportunity.stageRef?.name ?? opportunity.stage,
      count: 0,
      value: 0,
    };
    current.count += 1;
    current.value += opportunity.value ?? 0;
    stageMap.set(opportunity.stage, current);
  }
  const metrics: PipelineMetrics = {
    activeLeads: input.leads.filter((lead) => lead.status !== "DISQUALIFIED" && !lead.convertedOpportunityId).length,
    openOpportunities: openOpportunities.length,
    pipelineValue: openOpportunities.reduce((sum, opportunity) => sum + (opportunity.value ?? 0), 0),
    weightedValue: openOpportunities.reduce((sum, opportunity) => sum + ((opportunity.value ?? 0) * (opportunity.probability ?? 0)) / 100, 0),
    commitValue: openOpportunities
      .filter((opportunity) => opportunity.forecastCategory === "COMMIT")
      .reduce((sum, opportunity) => sum + (opportunity.value ?? 0), 0),
    stages: Array.from(stageMap, ([key, stage]) => ({ key, ...stage })),
  };

  return {
    generatedAt: now.toISOString(),
    timezone: "Asia/Dubai" as const,
    thresholds: { ...thresholds },
    today,
    atRisk,
    upcoming,
    metrics,
  };
}

export async function getDailyActionDashboard(product = "", now = new Date()) {
  const todayStart = startOfDubaiDay(now);
  const upcomingEnd = addDubaiDays(todayStart, CRM_HEALTH_THRESHOLDS.upcomingCommitmentDays + 1);
  const [leads, opportunities, tasks, meetings] = await Promise.all([
    prisma.lead.findMany({
      where: leadProductWhere(product),
      select: {
        id: true, name: true, company: true, status: true, primaryProduct: true,
        convertedOpportunityId: true, nextAction: true, nextActionDate: true, createdAt: true,
        activities: { select: { date: true } },
        tasks: {
          select: { id: true, title: true, dueDate: true, clientCommitmentDate: true, status: true, priority: true },
        },
      },
    }),
    prisma.opportunity.findMany({
      where: oppProductWhere(product),
      select: {
        id: true, name: true, product: true, stage: true, healthStatus: true, value: true,
        probability: true, forecastCategory: true, nextAction: true, nextActionDate: true,
        expectedCloseDate: true, closedAt: true,
        account: { select: { id: true, name: true } },
        stageRef: { select: { name: true, isWon: true, isLost: true } },
        activities: { select: { date: true } },
        tasks: {
          select: { id: true, title: true, dueDate: true, clientCommitmentDate: true, status: true, priority: true },
        },
      },
    }),
    prisma.task.findMany({
      where: { AND: [{ status: "OPEN" }, taskProductWhere(product)] },
      select: {
        id: true, title: true, dueDate: true, clientCommitmentDate: true, status: true, priority: true, product: true,
        lead: { select: { id: true, name: true, primaryProduct: true } },
        opportunity: { select: { id: true, name: true, product: true } },
        account: { select: { id: true, name: true } },
        contact: { select: { id: true, firstName: true, lastName: true } },
      },
    }),
    prisma.meetingTranscript.findMany({
      where: { meetingDate: { gte: todayStart, lt: upcomingEnd } },
      select: {
        id: true, title: true, meetingDate: true, detectedProduct: true,
        account: { select: { id: true, name: true } },
        contact: { select: { id: true, firstName: true, lastName: true } },
        lead: { select: { id: true, name: true, primaryProduct: true } },
      },
    }),
  ]);

  const productMeetings = product
    ? meetings.filter((meeting) => meeting.detectedProduct === product || meeting.lead?.primaryProduct === product)
    : meetings;
  return buildDailyActionDashboard({ leads, opportunities, tasks, meetings: productMeetings }, now);
}

export type DailyActionDashboard = Awaited<ReturnType<typeof getDailyActionDashboard>>;

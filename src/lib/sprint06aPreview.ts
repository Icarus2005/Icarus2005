import { prisma } from "./prisma";

// ArqOne CRM Sprint 06A — internal follow-up deadline preview. READ-ONLY.
// No create/update/delete/upsert calls anywhere in this module.
//
// TODAY = 2026-09-20, TOMORROW = 2026-09-21, Asia/Dubai. These are INTERNAL
// ArqOne follow-up targets (Task.dueDate) — never presented as a
// client-agreed commitment (that's the separate, still-empty
// Task.clientCommitmentDate field added this sprint).
//
// Matching is by exact task title only (trimmed, case-sensitive) — several
// of these 15 tasks were not created by this tooling's earlier sprints, so
// their real IDs are unknown here; exact-title match is the only
// deterministic way to find them without guessing.

const DUBAI_TZ_OFFSET = "+04:00";

function dubaiMidnightIso(dateStr: string): string {
  return `${dateStr}T00:00:00${DUBAI_TZ_OFFSET}`;
}

const TASK_ASSIGNMENTS: { title: string; proposedDueDate: string; context: string }[] = [
  { title: "Schedule detailed online/office PlacePulse meeting with Andrew Gaied", proposedDueDate: dubaiMidnightIso("2026-09-20"), context: "Tourism 365" },
  { title: "Prepare / send bespoke ADNEC-Tourism365 follow-up and progress meeting", proposedDueDate: dubaiMidnightIso("2026-09-20"), context: "Tourism 365 / Rebin Baby" },
  { title: "Follow up with Jezael Carrasco (and Oriol Escofet Bueno) for a deeper mobility-data meeting", proposedDueDate: dubaiMidnightIso("2026-09-20"), context: "Abu Dhabi Airports" },
  { title: "Send tailored Atlantis follow-up and seek stakeholder introduction", proposedDueDate: dubaiMidnightIso("2026-09-20"), context: "Atlantis Dubai / Roger Mosoti" },
  { title: "Follow up for relevant Emaar Entertainment decision-maker / use-case owner", proposedDueDate: dubaiMidnightIso("2026-09-20"), context: "Emaar Entertainment / Srushti Hatwar" },
  { title: "Follow up for appropriate DET internal introduction", proposedDueDate: dubaiMidnightIso("2026-09-20"), context: "DET / Christina Reynolds" },
  { title: "Send RAK-specific PlacePulse deck/demo link by email", proposedDueDate: dubaiMidnightIso("2026-09-20"), context: "RAK Tourism Development Authority / Emil Petrov" },

  { title: "Arrange detailed PlacePulse demo with Muhammad Nasir post-show", proposedDueDate: dubaiMidnightIso("2026-09-21"), context: "Doha Oasis" },
  { title: "Advance strategic partnership discussion with Ishaq Khattak; pursue Bahrain Airport introduction", proposedDueDate: dubaiMidnightIso("2026-09-21"), context: "Sabre" },
  { title: "Send referral-based PlacePulse introduction", proposedDueDate: dubaiMidnightIso("2026-09-21"), context: "Millennium Hotels & Resorts / Khaled Amer" },
  { title: "Send conservative EmQuest referral introduction", proposedDueDate: dubaiMidnightIso("2026-09-21"), context: "EmQuest / Balamurugan T" },
  { title: "Follow up on internal guidance / relevant Wyndham stakeholder", proposedDueDate: dubaiMidnightIso("2026-09-21"), context: "Wyndham Doha West Bay / Abir Abidi" },
  { title: "Develop GIATA partnership hypothesis / API discussion follow-up", proposedDueDate: dubaiMidnightIso("2026-09-21"), context: "GIATA / Konstantinos Panagiotakis" },
  { title: "Develop RateHawk partnership hypothesis / API discussion follow-up", proposedDueDate: dubaiMidnightIso("2026-09-21"), context: "RateHawk / Bhaji Bhadran" },
  { title: "Develop Travel Compositor partnership hypothesis / collaboration follow-up", proposedDueDate: dubaiMidnightIso("2026-09-21"), context: "Travel Compositor / Pablo Rojas Gomez" },
];

export async function previewSprint06aDueDates() {
  const allOpenTasks = await prisma.task.findMany({
    where: { status: "OPEN" },
    select: {
      id: true, title: true, dueDate: true, clientCommitmentDate: true, createdAt: true,
      account: { select: { name: true } },
      contact: { select: { firstName: true, lastName: true } },
      lead: { select: { name: true } },
      opportunity: { select: { name: true } },
    },
  });

  const rows = TASK_ASSIGNMENTS.map((spec) => {
    const matches = allOpenTasks.filter((t) => t.title.trim() === spec.title.trim());
    let classification: "READY_TO_UPDATE" | "CONFLICT" | "ALREADY_SET" | "NOT_FOUND" | "AMBIGUOUS";
    if (matches.length === 0) classification = "NOT_FOUND";
    else if (matches.length > 1) classification = "AMBIGUOUS";
    else {
      const t = matches[0];
      if (!t.dueDate) classification = "READY_TO_UPDATE";
      else if (t.dueDate.toISOString() === new Date(spec.proposedDueDate).toISOString()) classification = "ALREADY_SET";
      else classification = "CONFLICT";
    }
    const match = matches.length === 1 ? matches[0] : null;
    return {
      title: spec.title,
      context: spec.context,
      taskId: match?.id ?? null,
      account: match?.account?.name ?? null,
      contact: match?.contact ? `${match.contact.firstName} ${match.contact.lastName}` : null,
      lead: match?.lead?.name ?? null,
      opportunity: match?.opportunity?.name ?? null,
      currentDueDate: match?.dueDate?.toISOString() ?? null,
      currentClientCommitmentDate: match?.clientCommitmentDate?.toISOString() ?? null,
      proposedDueDate: spec.proposedDueDate,
      matchCount: matches.length,
      classification,
    };
  });

  const totalOpenTasks = allOpenTasks.length;
  const unmatchedOpenTasks = allOpenTasks.filter((t) => !TASK_ASSIGNMENTS.some((s) => s.title.trim() === t.title.trim()));

  return {
    generatedAt: new Date().toISOString(),
    timezone: "Asia/Dubai",
    today: "2026-09-20",
    tomorrow: "2026-09-21",
    summary: {
      totalAssignmentsSpecified: TASK_ASSIGNMENTS.length,
      readyToUpdate: rows.filter((r) => r.classification === "READY_TO_UPDATE").length,
      alreadySet: rows.filter((r) => r.classification === "ALREADY_SET").length,
      conflict: rows.filter((r) => r.classification === "CONFLICT").length,
      notFound: rows.filter((r) => r.classification === "NOT_FOUND").length,
      ambiguous: rows.filter((r) => r.classification === "AMBIGUOUS").length,
      dueToday: rows.filter((r) => r.proposedDueDate === dubaiMidnightIso("2026-09-20")).length,
      dueTomorrow: rows.filter((r) => r.proposedDueDate === dubaiMidnightIso("2026-09-21")).length,
      clientCommitmentDatesPopulated: 0,
      activitiesCreated: 0,
      duplicateTasksCreated: 0,
      otherRecordChanges: 0,
    },
    rows,
    totalOpenTasksInProduction: totalOpenTasks,
    openTasksNotInThisAssignmentList: unmatchedOpenTasks.map((t) => ({ id: t.id, title: t.title, dueDate: t.dueDate })),
  };
}

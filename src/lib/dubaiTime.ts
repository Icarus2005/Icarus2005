// Asia/Dubai calendar-day helpers for Task due-date semantics.
//
// Task.dueDate is an INTERNAL follow-up target, not a precise timestamp —
// "due 20 Sep" means due sometime during that Asia/Dubai calendar day, and
// must not become overdue until that whole day has passed. Comparing
// dueDate directly against the current instant (`now`) makes a task due
// "today" overdue the instant the clock passes its stored time-of-day
// (e.g. immediately at midnight, if stored as day-start) — wrong. The fix
// is comparing against the START OF TODAY'S Dubai calendar day rather than
// `now` itself: a dueDate is overdue only once it falls strictly before
// today's Dubai day began, which is exactly "the calendar day has passed"
// regardless of what time-of-day the dueDate timestamp encodes.
//
// Asia/Dubai is UTC+4 year-round (no DST), so this needs no timezone
// database — a fixed offset is sufficient and exact.

const DUBAI_OFFSET_MS = 4 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Start of the Asia/Dubai calendar day containing `date`, as a UTC instant. */
export function startOfDubaiDay(date: Date | string = new Date()): Date {
  const d = typeof date === "string" ? new Date(date) : date;
  const shifted = new Date(d.getTime() + DUBAI_OFFSET_MS);
  const flooredUtcMs = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate());
  return new Date(flooredUtcMs - DUBAI_OFFSET_MS);
}

/** Add `days` Asia/Dubai calendar days to a Dubai-day-aligned instant. */
export function addDubaiDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

/**
 * True once `dueDate`'s Asia/Dubai calendar day has fully passed relative
 * to `now`'s Asia/Dubai calendar day. A task due "today" is never overdue
 * today; it becomes overdue starting the next Dubai calendar day.
 */
export function isOverdueDubai(dueDate: Date | string | null | undefined, now: Date | string = new Date()): boolean {
  if (!dueDate) return false;
  const d = typeof dueDate === "string" ? new Date(dueDate) : dueDate;
  const nowD = typeof now === "string" ? new Date(now) : now;
  return d.getTime() < startOfDubaiDay(nowD).getTime();
}

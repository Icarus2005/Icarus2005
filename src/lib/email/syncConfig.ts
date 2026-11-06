export type MailboxSyncConfig = {
  intervalMinutes: number;
  initialLookbackDays: number;
  overlapMinutes: number;
  pageSize: number;
  maxPagesPerRun: number;
  retryBaseMinutes: number;
  retryMaxMinutes: number;
};

function boundedInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (!value?.trim()) return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}

export function getMailboxSyncConfig(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): MailboxSyncConfig {
  return {
    intervalMinutes: boundedInteger(environment.EMAIL_RECONCILE_INTERVAL_MINUTES, 30, 5, 1_440),
    initialLookbackDays: boundedInteger(environment.EMAIL_INITIAL_LOOKBACK_DAYS, 30, 1, 90),
    overlapMinutes: boundedInteger(environment.EMAIL_RECONCILE_OVERLAP_MINUTES, 60, 5, 1_440),
    // Two metadata/header GETs per message plus one list request. Five
    // messages for each of inbox/sent keeps one scheduled run below Zoho's
    // documented 30 Mail API requests/minute limit.
    pageSize: boundedInteger(environment.EMAIL_RECONCILE_PAGE_SIZE, 5, 1, 200),
    maxPagesPerRun: boundedInteger(environment.EMAIL_RECONCILE_MAX_PAGES, 1, 1, 50),
    retryBaseMinutes: boundedInteger(environment.EMAIL_RETRY_BASE_MINUTES, 5, 1, 60),
    retryMaxMinutes: boundedInteger(environment.EMAIL_RETRY_MAX_MINUTES, 360, 5, 1_440),
  };
}

export function initialLookbackFrom(now: Date, config: MailboxSyncConfig): Date {
  return new Date(now.getTime() - config.initialLookbackDays * 24 * 60 * 60 * 1_000);
}

export function nextOverlapFrom(now: Date, config: MailboxSyncConfig): Date {
  return new Date(now.getTime() - config.overlapMinutes * 60 * 1_000);
}

export function nextRetryAt(now: Date, failures: number, config: MailboxSyncConfig): Date {
  const multiplier = 2 ** Math.max(0, failures - 1);
  const delayMinutes = Math.min(config.retryMaxMinutes, config.retryBaseMinutes * multiplier);
  return new Date(now.getTime() + delayMinutes * 60 * 1_000);
}

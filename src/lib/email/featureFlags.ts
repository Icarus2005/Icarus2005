export const EMAIL_FEATURE_FLAG_NAMES = [
  "EMAIL_READ_SYNC_ENABLED",
  "EMAIL_ZOHO_WEBHOOK_ENABLED",
  "EMAIL_RELATIONSHIP_TIMELINE_ENABLED",
  "EMAIL_BODY_RETENTION_ENABLED",
  "EMAIL_SEND_V2_ENABLED",
] as const;

export type EmailFeatureFlagName = (typeof EMAIL_FEATURE_FLAG_NAMES)[number];
export type EmailFeatureFlags = Record<EmailFeatureFlagName, boolean>;

function explicitlyEnabled(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "true";
}

/** Missing, malformed and empty values fail closed. */
export function getEmailFeatureFlags(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): EmailFeatureFlags {
  return Object.fromEntries(
    EMAIL_FEATURE_FLAG_NAMES.map((name) => [name, explicitlyEnabled(environment[name])]),
  ) as EmailFeatureFlags;
}

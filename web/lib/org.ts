/**
 * Shared data scope for "company" mode.
 *
 * All logged-in users will read/write the same Firestore paths derived from this org id.
 * Configure via env when needed (e.g. Vercel):
 * - NEXT_PUBLIC_UEB_ORG_ID=ueb-prod
 */
export const DEFAULT_ORG_ID = "ueb";

export function getOrgId(): string {
  const raw =
    process.env.NEXT_PUBLIC_UEB_ORG_ID ??
    process.env.NEXT_PUBLIC_ORG_ID ??
    DEFAULT_ORG_ID;
  const v = raw.trim();
  return v.length ? v : DEFAULT_ORG_ID;
}


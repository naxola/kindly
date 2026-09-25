/**
 * Origins Better Auth accepts besides `BETTER_AUTH_URL`. A Vercel deploy
 * answers on several hosts at once — the deployment's own URL, the branch
 * URL (`<project>-git-<branch>-<team>.vercel.app`) and the production
 * domain — and a sign-up from any host other than `BETTER_AUTH_URL` was
 * rejected by Better Auth's origin check (found on staging, 2026-09-25).
 *
 * Exact hosts from Vercel's own system variables, never `*.vercel.app`:
 * that wildcard would trust every other Vercel customer's app too.
 * Outside Vercel none of these are set and the list is empty.
 */
export function vercelTrustedOrigins(env: Record<string, string | undefined> = process.env): string[] {
  const hosts = [env.VERCEL_URL, env.VERCEL_BRANCH_URL, env.VERCEL_PROJECT_PRODUCTION_URL];
  return [...new Set(hosts.filter((host): host is string => Boolean(host)).map((host) => `https://${host}`))];
}

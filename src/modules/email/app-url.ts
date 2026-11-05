/** Public base URL of the app (no trailing slash), for links inside emails. */
export function appBaseUrl(): string {
  return (process.env.BETTER_AUTH_URL ?? "").replace(/\/+$/, "");
}

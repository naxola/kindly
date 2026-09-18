/**
 * Barrel that re-exports every module's Drizzle schema. This is the single
 * file `drizzle-kit` points at (see `drizzle.config.ts`) and the single
 * import the Drizzle client needs for full type inference.
 *
 * Only Foundation modules have real tables so far (`auth`, `organizations`).
 * Add a re-export here as each future module gets its own `schema.ts`.
 */
export * from "@/modules/auth/schema";
export * from "@/modules/organizations/schema";

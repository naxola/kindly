/**
 * Drizzle schema for Better Auth's core tables.
 *
 * Field names (object keys) match exactly what Better Auth expects at
 * runtime — verified against the installed `better-auth` package's own
 * source (`@better-auth/core/src/db/schema/{shared,user,session,account,
 * verification}.ts`), not against documentation or memory, per
 * `CLAUDE.md` sección 3 ("no inventes capacidades").
 *
 * Table names are plural (`users`, `sessions`, `accounts`,
 * `verifications`) to match `docs/DATABASE.md` sección 3, using the
 * drizzle adapter's `usePlural: true` option (see `src/modules/auth/auth.ts`).
 * Column names in the actual database are snake_case, matching the rest of
 * the schema, while the exported object keys stay camelCase so the adapter
 * can match them.
 */
import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const accounts = pgTable("accounts", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  // "credential" for email+password; reserved for future OAuth providers.
  providerId: text("provider_id").notNull(),
  accountId: text("account_id").notNull(),
  // Only populated for the "credential" provider (email+password).
  password: text("password"),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const verifications = pgTable("verifications", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const authSchema = { users, sessions, accounts, verifications };

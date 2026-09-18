"use client";

import { createAuthClient } from "better-auth/react";

/**
 * Client-side Better Auth helper for use in Client Components
 * (`authClient.signIn.email(...)`, `authClient.signUp.email(...)`,
 * `authClient.signOut()`, `authClient.useSession()`).
 *
 * `baseURL` defaults to the current origin when omitted, which is correct
 * for this single Next.js app (API routes live under the same origin).
 */
export const authClient = createAuthClient();

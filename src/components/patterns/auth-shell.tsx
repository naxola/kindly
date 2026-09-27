import type { ReactNode } from "react";

/**
 * Shared shell for the pre-session screens (login, forgot/reset password,
 * invite) — outside `(app)`, so no `AppShell`/`PageContainer` here. Kept
 * intentionally narrow and centered, unchanged from the pre-design-system
 * version (docs/ui/ROADMAP.md, UI-4).
 */
export function AuthShell({ title = "Kindly", subtitle, children }: { title?: string; subtitle: ReactNode; children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-6 px-6">
      <div>
        <h1 className="type-page-title text-foreground">{title}</h1>
        <p className="type-body text-foreground-lighter">{subtitle}</p>
      </div>
      {children}
    </main>
  );
}

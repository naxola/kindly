-- Welcome email to a contact that introduces its reference delegate (ported from the previous app,
-- docs/DECISIONS.md 2026-11-16). Stamped per assignment: a new delegate means a new introduction.
ALTER TABLE "contact_assignments" ADD COLUMN "welcome_sent_at" TIMESTAMPTZ(3);

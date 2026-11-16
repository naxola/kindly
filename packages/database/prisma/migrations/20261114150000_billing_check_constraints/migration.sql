-- R3.1: billing tables refuse nonsensical values on their own, whatever the application does.
-- Additive: no data is changed. If existing rows break a rule, the migration stops and names it.
-- Before applying in an environment with data, check for offenders (each query must return 0):
--   SELECT count(*) FROM usage_events WHERE quantity <= 0;
--   SELECT count(*) FROM subscriptions WHERE current_period_end <= current_period_start OR spend_cap < 0;
--   SELECT count(*) FROM subscription_periods WHERE period_end <= period_start;
--   SELECT count(*) FROM billing_periods WHERE period_end <= period_start OR fixed_price < 0
--     OR overage_total < 0 OR amount_due < 0 OR spend_cap < 0;
--   SELECT count(*) FROM billing_period_lines WHERE used < 0 OR included < 0 OR overage_units < 0
--     OR unit_price < 0 OR amount < 0;

ALTER TABLE "usage_events"
  ADD CONSTRAINT "usage_events_quantity_positive" CHECK ("quantity" > 0);

ALTER TABLE "subscriptions"
  ADD CONSTRAINT "subscriptions_period_order" CHECK ("current_period_end" > "current_period_start"),
  ADD CONSTRAINT "subscriptions_spend_cap_non_negative" CHECK ("spend_cap" IS NULL OR "spend_cap" >= 0);

ALTER TABLE "subscription_periods"
  ADD CONSTRAINT "subscription_periods_period_order" CHECK ("period_end" > "period_start");

ALTER TABLE "billing_periods"
  ADD CONSTRAINT "billing_periods_period_order" CHECK ("period_end" > "period_start"),
  ADD CONSTRAINT "billing_periods_amounts_non_negative"
    CHECK ("fixed_price" >= 0 AND "overage_total" >= 0 AND "amount_due" >= 0),
  ADD CONSTRAINT "billing_periods_spend_cap_non_negative" CHECK ("spend_cap" IS NULL OR "spend_cap" >= 0);

ALTER TABLE "billing_period_lines"
  ADD CONSTRAINT "billing_period_lines_non_negative"
    CHECK ("used" >= 0 AND "overage_units" >= 0 AND "unit_price" >= 0 AND "amount" >= 0
           AND ("included" IS NULL OR "included" >= 0));

-- AlterEnum (ADR 0014): a charge is marked CHARGING before the provider is called.
ALTER TYPE "BillingPeriodStatus" ADD VALUE 'CHARGING' BEFORE 'CHARGED';

-- ════════════════════════════════════════════════════════════════════════════
-- CONNECT PRO — ADDITIONAL SCHEMA (everything added after complete-setup.sql)
-- ════════════════════════════════════════════════════════════════════════════
-- Run this ONCE in Supabase SQL Editor, after complete-setup.sql has already
-- been run. Safe to re-run — uses IF NOT EXISTS / DROP IF EXISTS guards.
--
-- This file exists because several tables were added incrementally across
-- later sessions as standalone migrations and were never folded back into
-- complete-setup.sql. Anyone (human or AI) setting up a fresh copy of this
-- project needs BOTH complete-setup.sql AND this file to get the real schema.
-- ════════════════════════════════════════════════════════════════════════════


-- ────────────────────────────────────────────────────────────────────────────
-- FIX — office_expenses category CHECK constraint was out of date
-- ────────────────────────────────────────────────────────────────────────────
-- complete-setup.sql restricts category to lowercase values
-- ('tea_refreshments','stationary','rent', ...), but the Store Expenses page
-- (src/pages/Admin/StoreExpensesPage.tsx) sends 'Rent','Electricity','Internet',
-- 'Stationery','Salary','Maintenance','Other'. Any of those categories would
-- be rejected by Postgres with a check-constraint violation. This widens the
-- constraint to accept both the original and current category sets.

ALTER TABLE public.office_expenses DROP CONSTRAINT IF EXISTS office_expenses_category_check;
ALTER TABLE public.office_expenses ADD CONSTRAINT office_expenses_category_check CHECK (
  category IN (
    'tea_refreshments','stationary','rent','electricity','internet','salary','miscellaneous','other',
    'Rent','Electricity','Internet','Stationery','Salary','Maintenance','Other'
  )
);


-- ────────────────────────────────────────────────────────────────────────────
-- 1. leads.location_link — customer visit location (Google Maps link)
-- ────────────────────────────────────────────────────────────────────────────
-- Set by Admin or Employee, visible to everyone like notes. Field Boy taps it
-- to open native Google Maps for directions.

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS location_link TEXT;
COMMENT ON COLUMN public.leads.location_link IS 'Google Maps link to the customer''s visit location';


-- ────────────────────────────────────────────────────────────────────────────
-- 2. employee_expenses — ad-hoc expenses submitted by employees (non-field-boy)
-- ────────────────────────────────────────────────────────────────────────────
-- Distinct from field_expenses (which is conveyance/DR-CR for field boys).
-- Used by: src/pages/Employee/EmployeeExpensesPage.tsx (submit),
--          src/pages/Admin/FieldExpensesPage.tsx (admin approve/reject — it
--          shows field_expenses and employee_expenses combined),
--          src/pages/Admin/BudgetPage.tsx (counts toward monthly spend limit),
--          src/pages/Admin/LedgerPage.tsx (shown as source "Employee")

CREATE TABLE IF NOT EXISTS public.employee_expenses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category        TEXT NOT NULL,   -- 'tea_refreshments' | 'stationary' | 'travel' | 'food' | 'other' | ... (free text, UI-driven)
  custom_category TEXT,
  amount          DECIMAL(10,2) NOT NULL,
  description     TEXT NOT NULL,
  expense_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_employee_expenses_user   ON public.employee_expenses(user_id);
CREATE INDEX IF NOT EXISTS idx_employee_expenses_date   ON public.employee_expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_employee_expenses_status ON public.employee_expenses(status);

ALTER TABLE public.employee_expenses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "employee_expenses_policy" ON public.employee_expenses;
CREATE POLICY "employee_expenses_policy" ON public.employee_expenses FOR ALL USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role = 'admin')
);


-- ────────────────────────────────────────────────────────────────────────────
-- 3. admin_credits — money coming INTO the business (Store Expenses "Credit")
-- ────────────────────────────────────────────────────────────────────────────
-- Used by: src/pages/Admin/StoreExpensesPage.tsx, src/pages/Admin/LedgerPage.tsx

CREATE TABLE IF NOT EXISTS public.admin_credits (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  added_by        UUID NOT NULL REFERENCES auth.users(id),
  category        TEXT NOT NULL,   -- 'sale_revenue' | 'investment' | 'refund' | 'other'
  custom_category TEXT,
  amount          DECIMAL(10,2) NOT NULL,
  description     TEXT NOT NULL,
  credit_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  reference       TEXT,            -- invoice #, transaction id, etc.
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_credits_date ON public.admin_credits(credit_date);

ALTER TABLE public.admin_credits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_credits_policy" ON public.admin_credits;
CREATE POLICY "admin_credits_policy" ON public.admin_credits FOR ALL USING (
  EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role = 'admin')
);


-- ────────────────────────────────────────────────────────────────────────────
-- 4. expense_budgets — per-employee monthly spend limit
-- ────────────────────────────────────────────────────────────────────────────
-- Used by: src/pages/Admin/BudgetPage.tsx ("Employee Spend Limit")

CREATE TABLE IF NOT EXISTS public.expense_budgets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  monthly_limit DECIMAL(10,2) NOT NULL,
  note          TEXT,
  updated_by    UUID REFERENCES auth.users(id),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.expense_budgets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "expense_budgets_policy" ON public.expense_budgets;
CREATE POLICY "expense_budgets_policy" ON public.expense_budgets FOR ALL USING (
  EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role = 'admin')
);


-- ────────────────────────────────────────────────────────────────────────────
-- 5. push_subscriptions — Web Push subscriptions (native browser notifications)
-- ────────────────────────────────────────────────────────────────────────────
-- Used by: src/lib/pushNotifications.ts, public/sw.js, api/notifications/send.js

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint   TEXT NOT NULL UNIQUE,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON public.push_subscriptions(user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "push_subscriptions_own_rows" ON public.push_subscriptions;
CREATE POLICY "push_subscriptions_own_rows" ON public.push_subscriptions FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);


-- ────────────────────────────────────────────────────────────────────────────
-- VERIFY
-- ────────────────────────────────────────────────────────────────────────────

SELECT 'Tables' AS check_type, tablename AS name FROM pg_tables WHERE schemaname = 'public'
  AND tablename IN ('employee_expenses','admin_credits','expense_budgets','push_subscriptions')
UNION ALL
SELECT 'Columns', 'leads.location_link' WHERE EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'location_link'
);

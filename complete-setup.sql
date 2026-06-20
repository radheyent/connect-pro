-- ════════════════════════════════════════════════════════════════════════════
-- CONNECT PRO — COMPLETE DATABASE SCHEMA
-- ════════════════════════════════════════════════════════════════════════════
-- Run this ONCE on a fresh Supabase project (SQL Editor → New Query → paste all → Run)
-- Safe to re-run — uses IF NOT EXISTS / DROP IF EXISTS guards throughout
-- ════════════════════════════════════════════════════════════════════════════


-- ────────────────────────────────────────────────────────────────────────────
-- SECTION 1 — CORE TABLES
-- ────────────────────────────────────────────────────────────────────────────

-- 1.1 User Profiles (admin / employee / field_boy)
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name       TEXT    NOT NULL,
  role       TEXT    NOT NULL CHECK (role IN ('admin', 'field_boy', 'employee')),
  is_active  BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL
);

-- 1.2 Leads
CREATE TABLE IF NOT EXISTS public.leads (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name               TEXT    NOT NULL,
  phone              TEXT    NOT NULL,
  matching_number    TEXT,
  current_operator   TEXT,
  status             TEXT    NOT NULL DEFAULT 'Fresh',
  -- Fresh | Not Connected | Not Interested | Interested | Follow-up | Complete
  assigned_to        UUID    REFERENCES auth.users(id) ON DELETE SET NULL,
  added_by           UUID    REFERENCES auth.users(id) ON DELETE SET NULL,
  last_call_date     TIMESTAMP WITH TIME ZONE,
  completed_date     TIMESTAMP WITH TIME ZONE,
  notes              TEXT,
  important          BOOLEAN DEFAULT false,
  created_date       TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL,
  last_call_duration INTEGER DEFAULT 0,
  pending_recall     BOOLEAN DEFAULT false,
  follow_up_date     DATE,
  follow_up_time     TEXT
);

-- 1.3 Call Attempts (genuine / fake call tracking)
CREATE TABLE IF NOT EXISTS public.call_attempts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id           UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id           UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  call_start_time   TIMESTAMP WITH TIME ZONE,
  call_end_time     TIMESTAMP WITH TIME ZONE,
  duration_seconds  INTEGER,
  fake_call         BOOLEAN DEFAULT false,   -- true if duration < 10s
  status_after_call TEXT,
  notes             TEXT,
  created_at        TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL
);

-- 1.4 WhatsApp Lead-Form Shares
CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id       UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  total_numbers TEXT NOT NULL,
  any_charge    TEXT NOT NULL,
  note          TEXT,
  pickup_time   TEXT NOT NULL,
  employee_name TEXT NOT NULL,
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL
);

-- 1.5 Archived Leads (Monthly Reset)
CREATE TABLE IF NOT EXISTS public.archived_leads (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_id UUID,
  name        TEXT,
  phone       TEXT,
  status      TEXT,
  assigned_to UUID,
  archived_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL,
  data        JSONB
);

-- 1.6 Announcements
CREATE TABLE IF NOT EXISTS public.announcements (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title      TEXT NOT NULL,
  content    TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL
);

-- 1.7 App Settings (KM rate, employee budget, etc.)
CREATE TABLE IF NOT EXISTS public.app_settings (
  key         VARCHAR(100) PRIMARY KEY,
  value       TEXT,
  updated_by  UUID REFERENCES auth.users(id),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 1.8 Field / Employee Expenses (conveyance + ad-hoc + sale closure expenses)
CREATE TABLE IF NOT EXISTS public.field_expenses (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id              UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  field_boy_id         UUID NOT NULL REFERENCES auth.users(id),  -- also used by 'employee' role
  closure_type         VARCHAR(30),
  -- 'completed' | 'resubmission' | 'cancelled' | 'adhoc' |
  -- 'customer_payment' | 'tea_refreshments' | 'stationary' | 'travel' |
  -- 'food' | 'printing' | 'communication' | 'other'
  expense_date         DATE NOT NULL DEFAULT CURRENT_DATE,
  kilometres           DECIMAL(8,2) NOT NULL DEFAULT 0,
  conveyance_amount    DECIMAL(10,2) NOT NULL DEFAULT 0,
  credit_collected     BOOLEAN DEFAULT false,
  credit_breakdown     JSONB DEFAULT '{"apartment_form":0,"security_deposit":0,"sim_charges":0,"other_charges":0,"other_description":""}',
  credit_total         DECIMAL(10,2) DEFAULT 0,
  description          TEXT,
  notes                TEXT,
  status               VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  admin_comment        TEXT,
  approved_by          UUID REFERENCES auth.users(id),
  approved_at          TIMESTAMPTZ,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

-- 1.9 Office / Admin Running Expenses
CREATE TABLE IF NOT EXISTS public.office_expenses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  added_by        UUID NOT NULL REFERENCES auth.users(id),
  category        VARCHAR(50) CHECK (category IN (
                    'tea_refreshments','stationary','rent',
                    'electricity','internet','salary','miscellaneous','other'
                  )),
  custom_category VARCHAR(100),
  amount          DECIMAL(10,2) NOT NULL,
  description     TEXT NOT NULL,
  expense_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);


-- ────────────────────────────────────────────────────────────────────────────
-- SECTION 2 — INDEXES (performance)
-- ────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_leads_assigned_to        ON public.leads(assigned_to);
CREATE INDEX IF NOT EXISTS idx_leads_status             ON public.leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_created_date        ON public.leads(created_date);

CREATE INDEX IF NOT EXISTS idx_call_attempts_lead        ON public.call_attempts(lead_id);
CREATE INDEX IF NOT EXISTS idx_call_attempts_user        ON public.call_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_call_attempts_fake        ON public.call_attempts(fake_call);

CREATE INDEX IF NOT EXISTS idx_field_expenses_field_boy  ON public.field_expenses(field_boy_id);
CREATE INDEX IF NOT EXISTS idx_field_expenses_date       ON public.field_expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_field_expenses_status     ON public.field_expenses(status);
CREATE INDEX IF NOT EXISTS idx_field_expenses_lead       ON public.field_expenses(lead_id);

CREATE INDEX IF NOT EXISTS idx_office_expenses_date      ON public.office_expenses(expense_date);


-- ────────────────────────────────────────────────────────────────────────────
-- SECTION 3 — ROW LEVEL SECURITY
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.user_profiles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_attempts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.archived_leads    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.field_expenses    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.office_expenses   ENABLE ROW LEVEL SECURITY;

-- Drop all existing policies first (safe re-run)
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname, tablename FROM pg_policies WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- 3.1 user_profiles — simple, no recursion (auth.uid() IS NOT NULL = any logged-in user)
CREATE POLICY "profiles_select" ON public.user_profiles FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "profiles_insert" ON public.user_profiles FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "profiles_update" ON public.user_profiles FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "profiles_delete" ON public.user_profiles FOR DELETE USING (auth.uid() IS NOT NULL);

-- 3.2 leads
CREATE POLICY "leads_select" ON public.leads FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "leads_insert" ON public.leads FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "leads_update" ON public.leads FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "leads_delete" ON public.leads FOR DELETE USING (auth.uid() IS NOT NULL);

-- 3.3 call_attempts
CREATE POLICY "calls_select" ON public.call_attempts FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "calls_insert" ON public.call_attempts FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "calls_update" ON public.call_attempts FOR UPDATE USING (auth.uid() IS NOT NULL);

-- 3.4 whatsapp_messages
CREATE POLICY "wa_select" ON public.whatsapp_messages FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "wa_insert" ON public.whatsapp_messages FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- 3.5 announcements (everyone reads, any logged-in user can write — UI restricts to admin)
CREATE POLICY "ann_select" ON public.announcements FOR SELECT USING (true);
CREATE POLICY "ann_insert" ON public.announcements FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "ann_update" ON public.announcements FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "ann_delete" ON public.announcements FOR DELETE USING (auth.uid() IS NOT NULL);

-- 3.6 archived_leads
CREATE POLICY "archive_select" ON public.archived_leads FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "archive_insert" ON public.archived_leads FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- 3.7 app_settings — anyone reads, admin writes
CREATE POLICY "settings_read" ON public.app_settings FOR SELECT USING (true);
CREATE POLICY "settings_write" ON public.app_settings FOR ALL USING (
  EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role = 'admin')
);

-- 3.8 field_expenses — own rows + admin sees all (field_boy_id stores employee ID too)
CREATE POLICY "field_expenses_policy" ON public.field_expenses FOR ALL USING (
  field_boy_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role = 'admin')
);

-- 3.9 office_expenses — admin only
CREATE POLICY "office_expenses_policy" ON public.office_expenses FOR ALL USING (
  EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role = 'admin')
);


-- ────────────────────────────────────────────────────────────────────────────
-- SECTION 4 — FUNCTIONS & TRIGGERS
-- ────────────────────────────────────────────────────────────────────────────

-- 4.1 Auto-set completed_date when lead status becomes 'Complete'
-- (powers the Celebration System + Reports)
CREATE OR REPLACE FUNCTION public.set_completed_date()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'Complete' AND (OLD.status IS NULL OR OLD.status != 'Complete') THEN
    NEW.completed_date = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_completed_date ON public.leads;
CREATE TRIGGER trg_completed_date
  BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.set_completed_date();


-- ────────────────────────────────────────────────────────────────────────────
-- SECTION 5 — REALTIME
-- ────────────────────────────────────────────────────────────────────────────
-- Powers: Celebration System, Recent Activity Panel
-- Safely add tables (ignores "already a member" error on re-run)

DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;
  EXCEPTION WHEN duplicate_object THEN NULL; END;

  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.announcements;
  EXCEPTION WHEN duplicate_object THEN NULL; END;

  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.field_expenses;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;


-- ────────────────────────────────────────────────────────────────────────────
-- SECTION 6 — DEFAULT SETTINGS
-- ────────────────────────────────────────────────────────────────────────────

INSERT INTO public.app_settings (key, value)
VALUES ('km_rate_per_km', '5')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.app_settings (key, value)
VALUES ('employee_expense_budget', '1000')
ON CONFLICT (key) DO NOTHING;


-- ────────────────────────────────────────────────────────────────────────────
-- SECTION 7 — FIRST ADMIN SETUP (manual step)
-- ────────────────────────────────────────────────────────────────────────────
-- Step 1: Supabase → Authentication → Users → Add User (Auto Confirm ON)
-- Step 2: Copy the generated UUID
-- Step 3: Uncomment and run the line below with that UUID

-- INSERT INTO public.user_profiles (id, name, role, is_active)
-- VALUES ('YOUR-USER-UUID-HERE', 'Admin', 'admin', true);


-- ────────────────────────────────────────────────────────────────────────────
-- SECTION 8 — BACKFILL (run once if migrating from an older schema)
-- ────────────────────────────────────────────────────────────────────────────
-- Sets completed_date for leads that were already Complete before the trigger existed

UPDATE public.leads
SET completed_date = COALESCE(last_call_date, created_date, NOW())
WHERE status = 'Complete' AND completed_date IS NULL;


-- ────────────────────────────────────────────────────────────────────────────
-- VERIFY — run this to confirm everything is set up correctly
-- ────────────────────────────────────────────────────────────────────────────

SELECT 'Tables'    AS check_type, tablename AS name FROM pg_tables  WHERE schemaname = 'public'
UNION ALL
SELECT 'Policies',  tablename || ' -> ' || policyname FROM pg_policies WHERE schemaname = 'public'
UNION ALL
SELECT 'Realtime',  tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime'
UNION ALL
SELECT 'Settings',  key || ' = ' || value FROM public.app_settings
ORDER BY check_type, name;

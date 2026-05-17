-- ================================================================
-- CONNECT PRO - COMPLETE DATABASE SETUP
-- Supabase > SQL Editor > New Query > Paste All > Run
-- Run this ONCE on a fresh Supabase project
-- ================================================================


-- ────────────────────────────────────────────────────────────────
-- SECTION 1: TABLES
-- ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.user_profiles (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name       TEXT    NOT NULL,
  role       TEXT    NOT NULL CHECK (role IN ('admin', 'field_boy', 'employee')),
  is_active  BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.leads (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name               TEXT    NOT NULL,
  phone              TEXT    NOT NULL,
  matching_number    TEXT,
  current_operator   TEXT,
  status             TEXT    NOT NULL DEFAULT 'Not Connected',
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

CREATE TABLE IF NOT EXISTS public.call_attempts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id           UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id           UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  call_start_time   TIMESTAMP WITH TIME ZONE,
  call_end_time     TIMESTAMP WITH TIME ZONE,
  duration_seconds  INTEGER,
  fake_call         BOOLEAN DEFAULT false,
  status_after_call TEXT,
  notes             TEXT,
  created_at        TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL
);

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

CREATE TABLE IF NOT EXISTS public.announcements (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title      TEXT NOT NULL,
  content    TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL
);


-- ────────────────────────────────────────────────────────────────
-- SECTION 2: ROW LEVEL SECURITY
-- ────────────────────────────────────────────────────────────────

ALTER TABLE public.user_profiles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_attempts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.archived_leads    ENABLE ROW LEVEL SECURITY;

-- Drop all existing policies first (safe to run multiple times)
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname, tablename FROM pg_policies WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- user_profiles
CREATE POLICY "p_profiles_select" ON public.user_profiles
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "p_profiles_insert" ON public.user_profiles
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "p_profiles_update" ON public.user_profiles
  FOR UPDATE USING (auth.uid() IS NOT NULL);

CREATE POLICY "p_profiles_delete" ON public.user_profiles
  FOR DELETE USING (auth.uid() IS NOT NULL);

-- leads
CREATE POLICY "p_leads_select" ON public.leads
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "p_leads_insert" ON public.leads
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "p_leads_update" ON public.leads
  FOR UPDATE USING (auth.uid() IS NOT NULL);

CREATE POLICY "p_leads_delete" ON public.leads
  FOR DELETE USING (auth.uid() IS NOT NULL);

-- call_attempts
CREATE POLICY "p_calls_select" ON public.call_attempts
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "p_calls_insert" ON public.call_attempts
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "p_calls_update" ON public.call_attempts
  FOR UPDATE USING (auth.uid() IS NOT NULL);

-- whatsapp_messages
CREATE POLICY "p_wa_select" ON public.whatsapp_messages
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "p_wa_insert" ON public.whatsapp_messages
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- announcements
CREATE POLICY "p_ann_select" ON public.announcements
  FOR SELECT USING (true);

CREATE POLICY "p_ann_insert" ON public.announcements
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "p_ann_update" ON public.announcements
  FOR UPDATE USING (auth.uid() IS NOT NULL);

CREATE POLICY "p_ann_delete" ON public.announcements
  FOR DELETE USING (auth.uid() IS NOT NULL);

-- archived_leads
CREATE POLICY "p_archive_select" ON public.archived_leads
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "p_archive_insert" ON public.archived_leads
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);


-- ────────────────────────────────────────────────────────────────
-- SECTION 3: AUTO completed_date TRIGGER
-- Sets completed_date automatically when status → Complete
-- Required for Celebration System to work
-- ────────────────────────────────────────────────────────────────

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


-- ────────────────────────────────────────────────────────────────
-- SECTION 4: REALTIME
-- ────────────────────────────────────────────────────────────────

-- Safely add tables to realtime (ignores if already added)
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.announcements;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;


-- ────────────────────────────────────────────────────────────────
-- SECTION 5: FIRST ADMIN SETUP
-- Step 1: Create user in Supabase > Authentication > Users
-- Step 2: Copy the UUID from Auth Users list
-- Step 3: Replace 'YOUR-USER-UUID-HERE' below and run
-- ────────────────────────────────────────────────────────────────

-- INSERT INTO public.user_profiles (id, name, role, is_active)
-- VALUES ('YOUR-USER-UUID-HERE', 'Admin', 'admin', true);


-- ────────────────────────────────────────────────────────────────
-- VERIFY: Run this to confirm everything is set up correctly
-- ────────────────────────────────────────────────────────────────

SELECT 'Tables' as check_type, tablename as name
FROM pg_tables WHERE schemaname = 'public'
UNION ALL
SELECT 'Policies', tablename || ' - ' || policyname
FROM pg_policies WHERE schemaname = 'public'
ORDER BY check_type, name;

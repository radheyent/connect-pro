-- ============================================================
-- CONNECT PRO - FINAL FIX SQL
-- Supabase → SQL Editor mein paste karo aur RUN karo
-- ============================================================

-- STEP 1: Pehle saari purani policies hatao
DO $$ 
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT policyname, tablename FROM pg_policies WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- STEP 2: RLS enable karo (agar pehle se hai toh koi issue nahi)
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.archived_leads ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- USER_PROFILES
-- ============================================================
-- Sabko dekhne ki permission
CREATE POLICY "profiles_select_all" ON public.user_profiles
  FOR SELECT USING (true);

-- Apna profile update kar sako
CREATE POLICY "profiles_update_own" ON public.user_profiles
  FOR UPDATE USING (auth.uid() = id);

-- Admin kisi bhi profile ko insert/update/delete kar sake
CREATE POLICY "profiles_admin_all" ON public.user_profiles
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- ============================================================
-- LEADS
-- ============================================================
-- Admin: sab kuch
CREATE POLICY "leads_admin_all" ON public.leads
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- Employee: apne assigned leads dekh sake
CREATE POLICY "leads_employee_select" ON public.leads
  FOR SELECT USING (
    assigned_to = auth.uid()
  );

-- Field Boy: saare Interested/Not Connected leads dekh sake
CREATE POLICY "leads_fieldboy_select" ON public.leads
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = auth.uid() AND p.role = 'field_boy')
  );

-- Employee/FieldBoy: apne assigned lead update kar sake
CREATE POLICY "leads_employee_update" ON public.leads
  FOR UPDATE USING (
    assigned_to = auth.uid() OR
    EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = auth.uid() AND p.role = 'field_boy')
  );

-- Employee: naya lead add kar sake
CREATE POLICY "leads_employee_insert" ON public.leads
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = auth.uid())
  );

-- ============================================================
-- CALL_ATTEMPTS
-- ============================================================
-- Admin: sab dekhe
CREATE POLICY "calls_admin_all" ON public.call_attempts
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- User: apni calls dekhe
CREATE POLICY "calls_user_select" ON public.call_attempts
  FOR SELECT USING (
    user_id = auth.uid()
  );

-- User: call log kare
CREATE POLICY "calls_user_insert" ON public.call_attempts
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
  );

-- ============================================================
-- WHATSAPP_MESSAGES
-- ============================================================
-- Admin: sab dekhe
CREATE POLICY "wa_admin_all" ON public.whatsapp_messages
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- User: apne messages dekhe
CREATE POLICY "wa_user_select" ON public.whatsapp_messages
  FOR SELECT USING (
    user_id = auth.uid()
  );

-- User: message log kare
CREATE POLICY "wa_user_insert" ON public.whatsapp_messages
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
  );

-- ============================================================
-- ANNOUNCEMENTS
-- ============================================================
-- Sab dekh sake
CREATE POLICY "announcements_select_all" ON public.announcements
  FOR SELECT USING (true);

-- Admin manage kare
CREATE POLICY "announcements_admin_all" ON public.announcements
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- ============================================================
-- ARCHIVED_LEADS
-- ============================================================
-- Admin hi dekhe
CREATE POLICY "archived_admin_all" ON public.archived_leads
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- ============================================================
-- CONNECT PRO - COMPLETE SUPABASE SETUP SQL
-- Supabase SQL Editor mein yeh poora paste karo aur Run karo
-- ============================================================

-- 1. TABLES (agar pehle nahi bane toh banata hai)
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'field_boy', 'employee')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  matching_number TEXT,
  current_operator TEXT,
  status TEXT DEFAULT 'Not Connected' NOT NULL,
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  added_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  last_call_date TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  important BOOLEAN DEFAULT false,
  created_date TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  completed_date TIMESTAMP WITH TIME ZONE,
  last_call_duration INTEGER DEFAULT 0,
  pending_recall BOOLEAN DEFAULT false,
  follow_up_date DATE,
  follow_up_time TEXT
);

CREATE TABLE IF NOT EXISTS public.call_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  call_start_time TIMESTAMP WITH TIME ZONE,
  call_end_time TIMESTAMP WITH TIME ZONE,
  duration_seconds INTEGER,
  fake_call BOOLEAN DEFAULT false,
  status_after_call TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  total_numbers TEXT NOT NULL,
  any_charge TEXT NOT NULL,
  note TEXT,
  pickup_time TEXT NOT NULL,
  employee_name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.archived_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_id UUID,
  name TEXT,
  phone TEXT,
  status TEXT,
  assigned_to UUID,
  archived_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  data JSONB
);

CREATE TABLE IF NOT EXISTS public.announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. RLS ENABLE
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.archived_leads ENABLE ROW LEVEL SECURITY;

-- 3. DROP OLD POLICIES (conflict se bachne ke liye)
DROP POLICY IF EXISTS "Public profiles are viewable by everyone." ON public.user_profiles;
DROP POLICY IF EXISTS "Users can update own profile." ON public.user_profiles;
DROP POLICY IF EXISTS "Admins can insert profiles" ON public.user_profiles;
DROP POLICY IF EXISTS "Admins can update profiles" ON public.user_profiles;
DROP POLICY IF EXISTS "Admins can delete profiles" ON public.user_profiles;
DROP POLICY IF EXISTS "Everyone can view announcements" ON public.announcements;
DROP POLICY IF EXISTS "Admins can manage announcements" ON public.announcements;
DROP POLICY IF EXISTS "Admins can do anything with leads" ON public.leads;
DROP POLICY IF EXISTS "Users can view leads" ON public.leads;
DROP POLICY IF EXISTS "Employees/FieldBoys can update assigned leads" ON public.leads;
DROP POLICY IF EXISTS "Employees can insert leads" ON public.leads;
DROP POLICY IF EXISTS "Users can insert call attempts" ON public.call_attempts;
DROP POLICY IF EXISTS "Users can view call attempts" ON public.call_attempts;
DROP POLICY IF EXISTS "Users can insert whatsapp messages" ON public.whatsapp_messages;
DROP POLICY IF EXISTS "Users can view whatsapp messages" ON public.whatsapp_messages;
DROP POLICY IF EXISTS "Admins can view archived leads" ON public.archived_leads;

-- 4. USER_PROFILES POLICIES
CREATE POLICY "Public profiles are viewable by everyone." ON public.user_profiles
  FOR SELECT USING (true);

CREATE POLICY "Users can update own profile." ON public.user_profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Admins can insert profiles" ON public.user_profiles
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can update profiles" ON public.user_profiles
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can delete profiles" ON public.user_profiles
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- 5. LEADS POLICIES
CREATE POLICY "Admins can do anything with leads" ON public.leads
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Users can view leads" ON public.leads
  FOR SELECT USING (
    assigned_to = auth.uid() OR
    EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role IN ('admin', 'field_boy'))
  );

CREATE POLICY "Employees can insert leads" ON public.leads
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role IN ('admin', 'employee', 'field_boy'))
  );

CREATE POLICY "Employees and FieldBoys can update assigned leads" ON public.leads
  FOR UPDATE USING (
    assigned_to = auth.uid() OR
    EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role IN ('admin', 'field_boy'))
  );

-- 6. CALL_ATTEMPTS POLICIES
CREATE POLICY "Users can view call attempts" ON public.call_attempts
  FOR SELECT USING (
    user_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role IN ('admin', 'field_boy'))
  );

CREATE POLICY "Users can insert call attempts" ON public.call_attempts
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid())
  );

-- 7. WHATSAPP_MESSAGES POLICIES
CREATE POLICY "Users can view whatsapp messages" ON public.whatsapp_messages
  FOR SELECT USING (
    user_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role IN ('admin'))
  );

CREATE POLICY "Users can insert whatsapp messages" ON public.whatsapp_messages
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid())
  );

-- 8. ANNOUNCEMENTS POLICIES
CREATE POLICY "Everyone can view announcements" ON public.announcements
  FOR SELECT USING (true);

CREATE POLICY "Admins can manage announcements" ON public.announcements
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- 9. ARCHIVED_LEADS POLICIES
CREATE POLICY "Admins can view archived leads" ON public.archived_leads
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role = 'admin')
  );

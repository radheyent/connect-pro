-- Connect Pro - Database Schema

-- 1. Create user_profiles table (extended info for Auth users)
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'field_boy', 'employee')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Create leads table
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

-- 3. Create call_attempts table
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

-- 4. Create whatsapp_messages table
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

-- 5. Create archived_leads table (for monthly reset)
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

-- 6. Create announcements table
CREATE TABLE IF NOT EXISTS public.announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS (Row Level Security) - Basic Setup
-- Enable RLS
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

-- Policies for user_profiles
CREATE POLICY "Public profiles are viewable by everyone." ON public.user_profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile." ON public.user_profiles FOR UPDATE USING (auth.uid() = id);

-- Policies for announcements
CREATE POLICY "Everyone can view announcements" ON public.announcements FOR SELECT USING (true);
CREATE POLICY "Admins can manage announcements" ON public.announcements FOR ALL USING (
  EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Policies for leads
CREATE POLICY "Admins can do anything with leads" ON public.leads FOR ALL USING (
  EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role = 'admin')
);

CREATE POLICY "Users can view leads" ON public.leads FOR SELECT USING (
  assigned_to = auth.uid() OR 
  EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role IN ('admin', 'field_boy'))
);

CREATE POLICY "Employees/FieldBoys can update assigned leads" ON public.leads FOR UPDATE USING (
  assigned_to = auth.uid() OR
  EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role IN ('admin', 'field_boy'))
)
WITH CHECK (
  (
    -- If it's an employee, they cannot set status to 'Complete'
    EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role = 'employee') 
    AND (EXISTS (SELECT 1 FROM public.leads WHERE id = leads.id AND status != 'Complete')) -- can't change from complete
    AND (
        -- They are NOT setting it to Complete
        (CASE WHEN status IS NOT NULL THEN status != 'Complete' ELSE true END)
    )
  )
  OR
  -- Admins and Field Boys can do any update (including setting to Complete)
  EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role IN ('admin', 'field_boy'))
);

-- Seed Default Admin
-- Note: You must create the user in Auth first, then get the ID.
-- INSERT INTO public.user_profiles (id, name, role) VALUES ('<USER_ID>', 'Admin', 'admin');

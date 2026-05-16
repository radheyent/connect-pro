import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = (import.meta as any).env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const fallbackUrl = 'https://placeholder.supabase.co';
const fallbackKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.K9piZZ0';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase URL and Anon Key are required. Please check your .env file.');
}

export const isSupabaseConfigured = !!supabaseUrl && supabaseUrl !== 'https://placeholder.supabase.co';
export const supabase = createClient(supabaseUrl || fallbackUrl, supabaseAnonKey || fallbackKey);

export type Role = 'admin' | 'field_boy' | 'employee';

export interface UserProfile {
  id: string;
  name: string;
  role: Role;
  is_active: boolean;
  created_at: string;
}

export interface Lead {
  id: string;
  name: string;
  phone: string;
  matching_number?: string;
  current_operator?: string;
  status: string;
  assigned_to?: string;
  added_by?: string;
  last_call_date?: string;
  notes?: string;
  important: boolean;
  created_date: string;
  completed_date?: string;
  last_call_duration: number;
  pending_recall: boolean;
  follow_up_date?: string;
  follow_up_time?: string;
  // Join data
  assigned_user?: UserProfile;
}

export interface CallAttempt {
  id: string;
  lead_id: string;
  user_id: string;
  call_start_time: string;
  call_end_time: string;
  duration_seconds: number;
  fake_call: boolean;
  status_after_call: string;
  notes?: string;
}

export interface WhatsAppMessage {
  id: string;
  lead_id: string;
  user_id: string;
  total_numbers: string;
  any_charge: string;
  note?: string;
  pickup_time: string;
  employee_name: string;
  created_at: string;
}

import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const supabaseAdmin = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  try {
    const { data: leads } = await supabaseAdmin.from('leads').select('*').order('created_date', { ascending: false });
    const { data: activity } = await supabaseAdmin.from('call_attempts').select('*, leads(name, phone)');
    const { data: employees } = await supabaseAdmin.from('user_profiles').select('*');

    const workbook = XLSX.utils.book_new();

    const completedLeads = (leads || []).filter(l => l.status === 'Complete');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(completedLeads.length ? completedLeads : [{ info: 'No completed leads yet' }]), 'Sales (Completed)');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(leads?.length ? leads : [{ info: 'No leads yet' }]), 'All Leads');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(activity?.length ? activity : [{ info: 'No activity yet' }]), 'Call Activity');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(employees?.length ? employees : [{ info: 'No employees yet' }]), 'Employees');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    const date = new Date().toISOString().split('T')[0];

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=connect_pro_backup_${date}.xlsx`);
    res.send(buffer);
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ error: error.message });
  }
}

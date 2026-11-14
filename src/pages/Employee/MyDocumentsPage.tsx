import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { FolderOpen, FileText, IdCard, ExternalLink, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface DocRow {
  id: string;
  doc_type: 'offerLetter' | 'employeeId' | string;
  file_name: string;
  file_url: string | null;
  storage_path: string | null;
  created_at: string;
}

const BUCKET = 'employee-docs';

const SECTIONS: Array<{ type: string; title: string; icon: React.ElementType }> = [
  { type: 'offerLetter', title: 'Offer Letter', icon: FileText },
  { type: 'employeeId', title: 'Employee ID Card', icon: IdCard },
];

const fmtDate = (iso: string): string =>
  new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

const MyDocumentsPage: React.FC = () => {
  const { user } = useAuth();
  const userId = user?.id;

  const [docs, setDocs] = useState<DocRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('employee_documents')
      .select('id, doc_type, file_name, file_url, storage_path, created_at')
      .eq('emp_id', userId)
      .order('created_at', { ascending: false });
    if (error) toast.error(error.message || 'Documents load nahi ho paaye');
    else setDocs((data as DocRow[]) ?? []);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const openDoc = async (d: DocRow) => {
    if (opening) return;
    setOpening(d.id);
    // Open the tab right away (inside the click) so mobile browsers don't block it
    const w = window.open('', '_blank');
    try {
      let url: string | null = null;
      if (d.storage_path) {
        const { data, error } = await supabase.storage
          .from(BUCKET)
          .createSignedUrl(d.storage_path, 120);
        if (error) throw error;
        url = data?.signedUrl ?? null;
      } else {
        url = d.file_url;
      }
      if (!url) throw new Error('File ka link nahi mila');
      if (w) w.location.href = url;
      else window.location.href = url;
    } catch (e: any) {
      if (w) w.close();
      toast.error(e?.message || 'Document khul nahi paaya');
    } finally {
      setOpening(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <div className="flex items-center gap-2">
        <FolderOpen className="h-5 w-5 text-blue-600" />
        <h2 className="text-lg font-bold">Mere Documents</h2>
      </div>

      {loading ? (
        <>
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-28 w-full rounded-xl" />
        </>
      ) : (
        SECTIONS.map(({ type, title, icon: Icon }) => {
          const list = docs.filter(d => d.doc_type === type);
          return (
            <Card key={type}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Icon className="h-4 w-4 text-blue-600" />
                  {title}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {list.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    Abhi upload nahi hua. Zarurat ho to admin se kahein.
                  </p>
                ) : (
                  list.map(d => (
                    <div
                      key={d.id}
                      className="flex items-center justify-between gap-3 rounded-lg border p-3 dark:border-slate-800"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{d.file_name}</p>
                        <p className="text-xs text-slate-500">{fmtDate(d.created_at)}</p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1 shrink-0"
                        disabled={opening === d.id}
                        onClick={() => openDoc(d)}
                      >
                        {opening === d.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <ExternalLink className="h-3.5 w-3.5" />
                        )}
                        Kholein
                      </Button>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
};

export default MyDocumentsPage;

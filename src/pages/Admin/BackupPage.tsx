import React, { useState } from 'react';
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle, 
  CardDescription,
  CardFooter
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter,
  DialogTrigger
} from '@/components/ui/dialog';
import { 
  Database, 
  Download, 
  RotateCcw, 
  Archive, 
  AlertTriangle,
  History,
  CheckCircle2,
  Loader2
} from 'lucide-react';
import { toast } from 'sonner';

const BackupPage: React.FC = () => {
  const [isResetLoading, setIsResetLoading] = useState(false);
  const [isExportLoading, setIsExportLoading] = useState(false);

  const handleExport = async () => {
    setIsExportLoading(true);
    try {
      const response = await fetch('/api/admin/backup/export');
      if (!response.ok) throw new Error('Export failed');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `connect_pro_backup_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast.success('Backup exported successfully');
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsExportLoading(false);
    }
  };

  const handleReset = async () => {
    setIsResetLoading(true);
    try {
      const response = await fetch('/api/admin/backup/reset', { method: 'POST' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);

      toast.success(`Monthly reset complete. ${result.archived} leads archived.`);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsResetLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="grid gap-6 md:grid-cols-2">
        {/* Export Card */}
        <Card>
          <CardHeader>
            <div className="p-2 w-fit bg-blue-100 dark:bg-blue-900/30 rounded-lg mb-2">
              <Download className="h-6 w-6 text-blue-600" />
            </div>
            <CardTitle>Manual Backup</CardTitle>
            <CardDescription>
              Download all sales (completed leads) and call activity as an Excel file.
            </CardDescription>
          </CardHeader>
          <CardContent>
             <p className="text-sm text-muted-foreground">
               This will generate a spreadsheet with two tabs: 
               <strong> Sales</strong> and <strong>Activity</strong>.
             </p>
          </CardContent>
          <CardFooter>
            <Button className="w-full" onClick={handleExport} disabled={isExportLoading}>
              {isExportLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              Generate Excel Backup
            </Button>
          </CardFooter>
        </Card>

        {/* Reset Card */}
        <Card className="border-orange-200 dark:border-orange-950">
          <CardHeader>
            <div className="p-2 w-fit bg-orange-100 dark:bg-orange-900/30 rounded-lg mb-2">
              <RotateCcw className="h-6 w-6 text-orange-600" />
            </div>
            <CardTitle>Monthly Reset</CardTitle>
            <CardDescription>
              Archive current data and clear pending recall flags.
            </CardDescription>
          </CardHeader>
          <CardContent>
             <div className="flex items-start gap-2 p-3 bg-orange-50 dark:bg-orange-950/20 rounded border border-orange-100 dark:border-orange-900 text-xs text-orange-800 dark:text-orange-200">
                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                <p>Warning: This action will move current lead snapshots to archive and reset system state. Perform a manual backup first.</p>
             </div>
          </CardContent>
          <CardFooter>
            <Dialog>
              <DialogTrigger render={<Button variant="outline" className="w-full border-orange-200 text-orange-600 hover:bg-orange-50" />}>
                <Archive className="mr-2 h-4 w-4" />
                Perform Reset
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Confirm Monthly Reset</DialogTitle>
                  <DialogDescription>
                    Are you sure you want to proceed? This will archive all existing leads data and reset pending recall flags for a new month.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="ghost">Cancel</Button>
                  <Button variant="destructive" onClick={handleReset} disabled={isResetLoading}>
                    {isResetLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Yes, Reset Now'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardFooter>
        </Card>
      </div>

      <Card>
        <CardHeader>
           <CardTitle className="flex items-center gap-2">
             <History className="h-5 w-5" />
             Archiving Logic
           </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
           <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
                 <CheckCircle2 className="h-4 w-4" />
              </div>
              <div className="text-sm">
                 <p className="font-medium">Step 1: Snapshot</p>
                 <p className="text-muted-foreground text-xs">All current lead data is captured and stored in the archive table.</p>
              </div>
           </div>
           <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
                 <CheckCircle2 className="h-4 w-4" />
              </div>
              <div className="text-sm">
                 <p className="font-medium">Step 2: Recall Reset</p>
                 <p className="text-muted-foreground text-xs">The `pending_recall` flag is set to false for all leads.</p>
              </div>
           </div>
           <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
                 <CheckCircle2 className="h-4 w-4" />
              </div>
              <div className="text-sm">
                 <p className="font-medium">Step 3: History Tracking</p>
                 <p className="text-muted-foreground text-xs">Activity logs remain intact for year-end reporting.</p>
              </div>
           </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default BackupPage;

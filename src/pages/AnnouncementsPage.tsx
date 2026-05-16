import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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
  Bell, 
  Plus, 
  Trash2, 
  Calendar, 
  User, 
  VolumeX 
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface Announcement {
  id: string;
  title: string;
  content: string;
  created_at: string;
  created_by: string;
  user_profiles?: {
    name: string;
  };
}

const AnnouncementsPage: React.FC = () => {
  const { user, profile } = useAuth();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');

  useEffect(() => {
    fetchAnnouncements();
  }, []);

  const fetchAnnouncements = async () => {
    setLoading(true);
    try {
      const { data: annData, error } = await supabase
        .from('announcements').select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;

      // Get creator names separately
      const creatorIds = [...new Set((annData||[]).map((a:any)=>a.created_by).filter(Boolean))];
      let nameMap: Record<string,string> = {};
      if (creatorIds.length > 0) {
        const { data: profiles } = await supabase.from('user_profiles').select('id,name').in('id', creatorIds);
        (profiles||[]).forEach((p:any)=>{ nameMap[p.id]=p.name; });
      }
      const enriched = (annData||[]).map((a:any)=>({
        ...a,
        user_profiles: a.created_by ? { name: nameMap[a.created_by]||'Admin' } : null
      }));
      setAnnouncements(enriched);
    } catch (error) {
      toast.error('Failed to fetch announcements');
    } finally {
      setLoading(false);
    }
  };

  const handleAddAnnouncement = async () => {
    if (!newTitle || !newContent) {
      toast.error('Please fill in all fields');
      return;
    }

    try {
      const { error } = await supabase.from('announcements').insert({
        title: newTitle,
        content: newContent,
        created_by: user?.id
      });

      if (error) throw error;
      toast.success('Announcement posted successfully');

      setNewTitle('');
      setNewContent('');
      setIsAddModalOpen(false);
      fetchAnnouncements();
    } catch (error) {
      toast.error('Failed to post announcement');
    }
  };

  const handleDeleteAnnouncement = async (id: string) => {
    if (!confirm('Are you sure you want to delete this announcement?')) return;

    try {
      const { error } = await supabase.from('announcements').delete().eq('id', id);
      if (error) throw error;
      
      toast.success('Announcement deleted');
      fetchAnnouncements();
    } catch (error) {
      toast.error('Failed to delete announcement');
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between border-b pb-4 border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Announcements</h1>
          <p className="text-sm text-slate-500">Stay updated with the latest news from administration</p>
        </div>
        {profile?.role === 'admin' && (
          <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
            <DialogTrigger asChild>
              <Button className="bg-blue-600 hover:bg-blue-700">
                <Plus className="h-4 w-4 mr-2" />
                Post New
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Announcement</DialogTitle>
                <DialogDescription>
                  This announcement will be visible to all employees and staff.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Title</label>
                  <Input 
                    placeholder="e.g. System Maintenance" 
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Content</label>
                  <textarea 
                    className="flex min-h-[120px] w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-slate-950 dark:ring-offset-slate-950 dark:placeholder:text-slate-400 dark:focus-visible:ring-slate-300"
                    placeholder="What would you like to announce?"
                    value={newContent}
                    onChange={(e) => setNewContent(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddModalOpen(false)}>Cancel</Button>
                <Button onClick={handleAddAnnouncement} className="bg-blue-600 hover:bg-blue-700">Post Announcement</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="grid gap-4">
        {loading ? (
          Array(3).fill(0).map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader><div className="h-6 w-1/3 bg-slate-100 rounded" /></CardHeader>
              <CardContent><div className="h-20 bg-slate-50 rounded" /></CardContent>
            </Card>
          ))
        ) : announcements.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-xl border border-dashed border-slate-300">
            <VolumeX className="h-12 w-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">No announcements yet</p>
          </div>
        ) : (
          announcements.map((ann) => (
            <Card key={ann.id} className="overflow-hidden border-slate-200 shadow-sm hover:shadow-md transition-shadow">
              <CardHeader className="bg-slate-50/50 pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-blue-600">
                    <Bell className="h-4 w-4" />
                    <CardTitle className="text-lg font-bold">{ann.title}</CardTitle>
                  </div>
                  {profile?.role === 'admin' && (
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => handleDeleteAnnouncement(ann.id)}
                      className="text-slate-400 hover:text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <CardDescription className="flex items-center gap-4 mt-1">
                  <span className="flex items-center gap-1">
                    <User className="h-3 w-3" />
                    {ann.user_profiles?.name || 'Administrator'}
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {format(new Date(ann.created_at), 'PPPp')}
                  </span>
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-4">
                <p className="text-slate-700 leading-relaxed whitespace-pre-wrap">{ann.content}</p>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
};

export default AnnouncementsPage;

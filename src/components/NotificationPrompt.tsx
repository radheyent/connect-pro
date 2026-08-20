import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  enablePushNotifications,
  isPushSupported,
  getNotificationPermissionState,
} from '@/lib/pushNotifications';
import { Bell } from 'lucide-react';

// Drop <NotificationPrompt /> once inside each dashboard layout (Admin/Employee/FieldBoy).
// Shows a small banner asking for permission; does nothing if already granted/denied/unsupported.
export default function NotificationPrompt() {
  const { user } = useAuth();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!user) return;
    if (!isPushSupported()) return;
    if (getNotificationPermissionState() === 'default') {
      setShow(true);
    }
  }, [user]);

  if (!show || !user) return null;

  const handleEnable = async () => {
    const result = await enablePushNotifications(user.id);
    setShow(false);
    if (!result.ok) {
      console.warn('Push notification setup:', result.reason);
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-xl border border-white/10 bg-slate-900/90 backdrop-blur-md px-4 py-3 shadow-lg max-w-sm">
      <Bell className="h-5 w-5 text-blue-400 shrink-0" />
      <div className="flex-1 text-sm text-slate-200">
        Naye leads aur updates ke liye notifications on karein
      </div>
      <button
        onClick={handleEnable}
        className="text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg"
      >
        Allow
      </button>
      <button
        onClick={() => setShow(false)}
        className="text-xs text-slate-400 hover:text-slate-200"
      >
        Later
      </button>
    </div>
  );
}

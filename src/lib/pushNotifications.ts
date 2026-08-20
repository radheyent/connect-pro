import { supabase } from './supabase';

// Public VAPID key (safe to expose in frontend, this is not secret)
const VAPID_PUBLIC_KEY = (import.meta as any).env.VITE_VAPID_PUBLIC_KEY as string;

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

export function isPushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window;
}

// Call this after login (e.g. from a "Enable Notifications" button or AuthContext)
export async function enablePushNotifications(userId: string) {
  if (!isPushSupported()) {
    return { ok: false, reason: 'unsupported' as const };
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return { ok: false, reason: 'denied' as const };
  }

  const registration = await navigator.serviceWorker.ready;

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }

  const subJson = subscription.toJSON();

  // Save subscription against this user so backend can target them
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: userId,
      endpoint: subJson.endpoint,
      p256dh: subJson.keys?.p256dh,
      auth: subJson.keys?.auth,
    },
    { onConflict: 'endpoint' }
  );

  if (error) {
    console.error('Failed to save push subscription:', error);
    return { ok: false, reason: 'save_failed' as const };
  }

  return { ok: true as const };
}

export async function disablePushNotifications() {
  if (!isPushSupported()) return;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (subscription) {
    await supabase.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint);
    await subscription.unsubscribe();
  }
}

export function getNotificationPermissionState(): NotificationPermission | 'unsupported' {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

// Fires a real native OS/phone notification immediately (works while app is open,
// including foreground) via the service worker — used to convert in-app toasts
// into native notifications. Silently does nothing if permission isn't granted yet.
export async function showNativeNotification(
  title: string,
  body: string,
  opts?: { url?: string; tag?: string; icon?: string }
) {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    if (!('serviceWorker' in navigator)) return;
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification(title, {
      body,
      icon: opts?.icon || '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: opts?.url || '/' },
      tag: opts?.tag,
      renotify: !!opts?.tag,
      vibrate: [200, 100, 200],
    } as NotificationOptions);
  } catch (e) {
    console.warn('showNativeNotification failed:', e);
  }
}

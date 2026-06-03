import { useEffect, useState, useCallback } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

const PWAInstallButton = () => {
  const [canInstall, setCanInstall] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Already installed as PWA (standalone mode)?
    const mq = window.matchMedia('(display-mode: standalone)');
    if (mq.matches || (navigator as any).standalone === true) {
      setIsInstalled(true);
      return;
    }

    // Check if prompt was captured before this component mounted
    if ((window as any).__pwaInstallPrompt) {
      setCanInstall(true);
      return;
    }

    // Listen for the prompt event (fires once per browser session)
    const handler = () => {
      setCanInstall(true);
    };

    window.addEventListener('pwa-installable', handler);

    // Also listen directly on beforeinstallprompt in case it fires late
    const beforeHandler = (e: Event) => {
      e.preventDefault();
      (window as any).__pwaInstallPrompt = e;
      setCanInstall(true);
    };
    window.addEventListener('beforeinstallprompt', beforeHandler);

    // Listen for app installed event
    const installedHandler = () => {
      setIsInstalled(true);
      setCanInstall(false);
    };
    window.addEventListener('appinstalled', installedHandler);

    return () => {
      window.removeEventListener('pwa-installable', handler);
      window.removeEventListener('beforeinstallprompt', beforeHandler);
      window.removeEventListener('appinstalled', installedHandler);
    };
  }, []);

  const handleInstall = useCallback(async () => {
    const prompt = (window as any).__pwaInstallPrompt;
    if (!prompt) {
      // Fallback instruction for browsers that don't expose the prompt
      toast.info('To install: tap browser menu → "Add to Home Screen"', {
        duration: 5000,
      });
      return;
    }
    try {
      prompt.prompt();
      const { outcome } = await prompt.userChoice;
      if (outcome === 'accepted') {
        setCanInstall(false);
        setIsInstalled(true);
        (window as any).__pwaInstallPrompt = null;
        toast.success('Connect Pro installed! 🎉');
      }
    } catch {
      // prompt may have already been used
      setCanInstall(false);
    }
  }, []);

  // Hide if already installed as PWA or no install available
  if (isInstalled) return null;
  if (!canInstall) return null;

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={handleInstall}
      className="flex items-center gap-1.5 text-xs h-8 border-blue-200 text-blue-600 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-400 dark:hover:bg-blue-950/30"
      title="Install Connect Pro as an app"
    >
      <Download className="h-3.5 w-3.5" />
      <span className="hidden xs:inline sm:inline">Install</span>
    </Button>
  );
};

export default PWAInstallButton;

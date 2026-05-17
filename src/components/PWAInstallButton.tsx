import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

const PWAInstallButton = () => {
  const [canInstall, setCanInstall] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Already installed as PWA?
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
      return;
    }

    // Prompt already captured?
    if ((window as any).__pwaInstallPrompt) {
      setCanInstall(true);
    }

    // Listen for future prompt
    const handler = () => setCanInstall(true);
    window.addEventListener('pwa-installable', handler);
    return () => window.removeEventListener('pwa-installable', handler);
  }, []);

  const handleInstall = async () => {
    const prompt = (window as any).__pwaInstallPrompt;
    if (!prompt) {
      toast.info('Install: browser menu → "Add to Home Screen"');
      return;
    }
    prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === 'accepted') {
      setCanInstall(false);
      setIsInstalled(true);
      toast.success('Connect Pro installed! 🎉');
    }
  };

  if (isInstalled || !canInstall) return null;

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={handleInstall}
      className="hidden sm:flex items-center gap-1.5 text-xs h-8 border-blue-200 text-blue-600 hover:bg-blue-50"
    >
      <Download className="h-3.5 w-3.5" />
      Install App
    </Button>
  );
};

export default PWAInstallButton;

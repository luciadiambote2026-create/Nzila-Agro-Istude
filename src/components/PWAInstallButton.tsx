import React, { useEffect, useState } from 'react';
import { Download } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsInstalled(isStandalone);

    const userAgent = window.navigator.userAgent.toLowerCase();
    setIsIOS(/iphone|ipad|ipod/.test(userAgent));

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const install = async () => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setDeferredPrompt(null);
      return true;
    }
    return false;
  };

  return {
    isInstallable: Boolean(deferredPrompt),
    isInstalled,
    isIOS,
    install,
  };
}

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className="inline-flex items-center gap-1.5 rounded-lg border border-[#15803D] bg-[#EEF7F0] px-3 py-2 text-xs font-semibold text-[#14532D] hover:bg-[#DCECE0] transition-colors whitespace-nowrap shrink-0"
      >
        <Download className="w-3.5 h-3.5" aria-hidden="true" />
        Instalar App
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[#D4DDD6] bg-white px-3 py-2 text-xs font-semibold text-[#14532D] hover:bg-[#F2F7F3] transition-colors whitespace-nowrap shrink-0"
        >
          <Download className="w-3.5 h-3.5" aria-hidden="true" />
          Instalar no iOS
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
            <div className="w-full max-w-sm rounded-xl border border-[#DCE5DE] bg-white p-6 shadow-xl">
              <h3 className="font-display text-base font-bold text-[#111814]">
                Instalar Nzila Agro no iPhone / iPad
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-[#445449]">
                1. Toque no botão <strong>Partilhar</strong> na barra do Safari.
                <br />
                2. Deslize e toque em <strong>Adicionar ao Ecrã Principal</strong>.
              </p>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-4 w-full rounded-lg bg-[#14532D] py-2 text-xs font-semibold text-white hover:bg-[#15803D] transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};

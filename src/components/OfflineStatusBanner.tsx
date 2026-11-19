import React, { useEffect, useRef, useState } from 'react';
import { Wifi, WifiOff } from 'lucide-react';

export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}

interface OfflineStatusBannerProps {
  onReconnected?: () => void;
}

export const OfflineStatusBanner: React.FC<OfflineStatusBannerProps> = ({ onReconnected }) => {
  const isOnline = useOnlineStatus();
  const [justReconnected, setJustReconnected] = useState(false);
  const wasOfflineRef = useRef(false);

  useEffect(() => {
    if (!isOnline) {
      wasOfflineRef.current = true;
      setJustReconnected(false);
      return;
    }

    if (wasOfflineRef.current) {
      wasOfflineRef.current = false;
      setJustReconnected(true);
      onReconnected?.();
      const timer = window.setTimeout(() => setJustReconnected(false), 4500);
      return () => window.clearTimeout(timer);
    }
  }, [isOnline, onReconnected]);

  if (isOnline && !justReconnected) {
    return null;
  }

  if (!isOnline) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="fixed bottom-4 left-4 z-50 max-w-sm rounded-xl border border-[#EAB308] bg-[#FEFCE8] px-4 py-3 text-xs text-[#713F12] shadow-lg"
      >
        <div className="flex items-start gap-2.5">
          <WifiOff className="w-4 h-4 text-[#B45309] shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <div className="font-display font-bold text-[#713F12]">Estado Offline</div>
            <p className="mt-0.5 text-[11px] leading-relaxed text-[#713F12]/90">
              Sem ligação à internet. A interface principal e os dados em cache continuam disponíveis para consulta.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-4 z-50 max-w-sm rounded-xl border border-[#15803D]/40 bg-[#EEF7F0] px-4 py-3 text-xs text-[#14532D] shadow-lg"
    >
      <div className="flex items-center gap-2.5">
        <Wifi className="w-4 h-4 text-[#15803D] shrink-0" aria-hidden="true" />
        <span className="font-semibold">Conexão restabelecida — A sincronizar dados da plataforma.</span>
      </div>
    </div>
  );
};

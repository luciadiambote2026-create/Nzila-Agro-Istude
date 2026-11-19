import type { CurrencyCode, FinancialSettings } from '../types';

export const ANGOLA_PROVINCES = [
  'Luanda',
  'Bengo',
  'Benguela',
  'Bié',
  'Cabinda',
  'Cuando Cubango',
  'Cuanza Norte',
  'Cuanza Sul',
  'Cunene',
  'Huambo',
  'Huíla',
  'Lunda Norte',
  'Lunda Sul',
  'Malanje',
  'Moxico',
  'Namibe',
  'Uíge',
  'Zaire',
];

const TOKEN_STORAGE_KEY = 'nzila_agro_jwt';

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function setStoredToken(token: string | null): void {
  if (token) {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  }
}

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(path, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Erro na requisição (${response.status})`);
  }

  return data as T;
}

export function convertFromKz(amountKz: number, targetCurrency: CurrencyCode, settings: FinancialSettings): number {
  if (targetCurrency === 'AOA') return amountKz;
  if (targetCurrency === 'USD') return amountKz / Math.max(settings.rateUsdToKz, 1);
  if (targetCurrency === 'EUR') return amountKz / Math.max(settings.rateEurToKz, 1);
  if (targetCurrency === 'GBP') return amountKz / Math.max(settings.rateGbpToKz, 1);
  return amountKz;
}

export function convertToKz(amount: number, sourceCurrency: CurrencyCode, settings: FinancialSettings): number {
  if (sourceCurrency === 'AOA') return amount;
  if (sourceCurrency === 'USD') return amount * settings.rateUsdToKz;
  if (sourceCurrency === 'EUR') return amount * settings.rateEurToKz;
  if (sourceCurrency === 'GBP') return amount * settings.rateGbpToKz;
  return amount;
}

export function formatCurrency(amount: number, currency: CurrencyCode): string {
  if (currency === 'AOA') {
    return `${new Intl.NumberFormat('pt-AO', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(amount))} Kz`;
  }
  const symbol = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : '£';
  return `${symbol} ${new Intl.NumberFormat('pt-AO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)}`;
}

export function formatActiveDuration(totalSeconds: number): string {
  const sec = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(sec / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  const seconds = sec % 60;
  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
  }
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

export async function compressImageFileToDataUrl(file: File, maxDimension = 960, quality = 0.84): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Falha ao ler imagem.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Formato de imagem inválido.'));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDimension || height > maxDimension) {
          const ratio = Math.min(maxDimension / width, maxDimension / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Erro ao processar imagem.'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Falha ao ler ficheiro.'));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

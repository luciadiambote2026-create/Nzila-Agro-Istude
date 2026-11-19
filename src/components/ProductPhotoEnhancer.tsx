import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Check,
  Eye,
  RotateCcw,
  RotateCw,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Wand2,
} from 'lucide-react';

interface ProductPhotoEnhancerProps {
  sourceImageUrl: string;
  onApplyEnhancedImage: (enhancedDataUrl: string) => void;
}

interface ImageAdjustments {
  brightness: number; // -40 to +45
  contrast: number; // -30 to +50
  saturation: number; // -30 to +45
  sharpness: number; // 0 to 100
  rotation: 0 | 90 | 180 | 270;
}

const DEFAULT_ADJUSTMENTS: ImageAdjustments = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  sharpness: 0,
  rotation: 0,
};

const clampByte = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));

function analyzeHistogram(img: HTMLImageElement): {
  suggested: Partial<ImageAdjustments>;
  diagnosis: string;
} {
  const sampleW = Math.min(240, img.naturalWidth || img.width || 240);
  const sampleH = Math.max(
    1,
    Math.round(sampleW * ((img.naturalHeight || img.height || 180) / (img.naturalWidth || img.width || 240)))
  );

  const off = document.createElement('canvas');
  off.width = sampleW;
  off.height = sampleH;
  const ctx = off.getContext('2d');
  if (!ctx) {
    return {
      suggested: { brightness: 10, contrast: 14, saturation: 10, sharpness: 25 },
      diagnosis: 'Otimização padrão aplicada para produtos agrícolas.',
    };
  }

  ctx.drawImage(img, 0, 0, sampleW, sampleH);
  const { data } = ctx.getImageData(0, 0, sampleW, sampleH);
  const histogram = new Uint32Array(256);
  let totalPixels = 0;
  let lumSum = 0;

  for (let i = 0; i < data.length; i += 4) {
    const lum = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    histogram[lum] += 1;
    lumSum += lum;
    totalPixels += 1;
  }

  if (totalPixels === 0) {
    return {
      suggested: { brightness: 8, contrast: 12, saturation: 10, sharpness: 20 },
      diagnosis: 'Ajuste equilibrado aplicado.',
    };
  }

  const meanLum = lumSum / totalPixels;

  // Find 2nd and 98th percentile luminance for dynamic contrast spread
  const lowTarget = Math.floor(totalPixels * 0.02);
  const highTarget = Math.floor(totalPixels * 0.98);
  let acc = 0;
  let p2 = 0;
  let p98 = 255;

  for (let i = 0; i < 256; i++) {
    acc += histogram[i];
    if (acc >= lowTarget) {
      p2 = i;
      break;
    }
  }
  acc = 0;
  for (let i = 0; i < 256; i++) {
    acc += histogram[i];
    if (acc >= highTarget) {
      p98 = i;
      break;
    }
  }

  const spread = Math.max(1, p98 - p2);

  // Target pleasant natural agricultural daylight mean (~136)
  let brightness = Math.round((136 - meanLum) * 0.42);
  brightness = Math.max(-22, Math.min(34, brightness));

  // Boost contrast more if histogram is flat/washed out
  let contrast = spread < 150 ? Math.round(((185 - spread) / 185) * 42) : 12;
  contrast = Math.max(8, Math.min(36, contrast));

  const saturation = 12;
  const sharpness = 30;

  let condition = 'Exposição equilibrada';
  if (meanLum < 102) condition = 'Foto escura detetada';
  else if (meanLum > 172) condition = 'Excesso de luz detetado';
  else if (spread < 135) condition = 'Contraste baixo detetado';

  const bSign = brightness >= 0 ? `+${brightness}` : `${brightness}`;
  return {
    suggested: { brightness, contrast, saturation, sharpness },
    diagnosis: `${condition} · Brilho ${bSign}%, Contraste +${contrast}%, Saturação +${saturation}%`,
  };
}

function renderProcessedToCanvas(
  img: HTMLImageElement,
  canvas: HTMLCanvasElement,
  adj: ImageAdjustments,
  maxSide: number
): void {
  const natW = img.naturalWidth || img.width;
  const natH = img.naturalHeight || img.height;
  if (!natW || !natH) return;

  const scale = Math.min(1, maxSide / Math.max(natW, natH));
  const drawW = Math.max(1, Math.round(natW * scale));
  const drawH = Math.max(1, Math.round(natH * scale));
  const isRotatedOdd = adj.rotation === 90 || adj.rotation === 270;

  canvas.width = isRotatedOdd ? drawH : drawW;
  canvas.height = isRotatedOdd ? drawW : drawH;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((adj.rotation * Math.PI) / 180);
  ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
  ctx.restore();

  const needsPixelPass =
    adj.brightness !== 0 || adj.contrast !== 0 || adj.saturation !== 0 || adj.sharpness > 0;
  if (!needsPixelPass) return;

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  // Brightness offset (-102 to +115) and standard contrast formula
  const brightnessOffset = (adj.brightness / 100) * 120;
  const contrastVal = (adj.contrast / 100) * 130;
  const contrastFactor = (259 * (contrastVal + 255)) / (255 * (259 - contrastVal));
  const satFactor = 1 + adj.saturation / 100;

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i] + brightnessOffset;
    let g = data[i + 1] + brightnessOffset;
    let b = data[i + 2] + brightnessOffset;

    r = contrastFactor * (r - 128) + 128;
    g = contrastFactor * (g - 128) + 128;
    b = contrastFactor * (b - 128) + 128;

    if (adj.saturation !== 0) {
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      r = gray + (r - gray) * satFactor;
      g = gray + (g - gray) * satFactor;
      b = gray + (b - gray) * satFactor;
    }

    data[i] = clampByte(r);
    data[i + 1] = clampByte(g);
    data[i + 2] = clampByte(b);
  }

  // Optional 3x3 unsharp / sharpen convolution kernel
  if (adj.sharpness > 0) {
    const amount = (adj.sharpness / 100) * 0.55;
    const w = canvas.width;
    const h = canvas.height;
    const copy = new Uint8ClampedArray(data);

    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = (y * w + x) * 4;
        const up = ((y - 1) * w + x) * 4;
        const down = ((y + 1) * w + x) * 4;
        const left = (y * w + (x - 1)) * 4;
        const right = (y * w + (x + 1)) * 4;

        for (let c = 0; c < 3; c++) {
          const center = copy[idx + c];
          const avgNeighbors =
            (copy[up + c] + copy[down + c] + copy[left + c] + copy[right + c]) * 0.25;
          data[idx + c] = clampByte(center + (center - avgNeighbors) * amount * 2.2);
        }
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

export const ProductPhotoEnhancer: React.FC<ProductPhotoEnhancerProps> = ({
  sourceImageUrl,
  onApplyEnhancedImage,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [adjustments, setAdjustments] = useState<ImageAdjustments>(DEFAULT_ADJUSTMENTS);
  const [compareOriginal, setCompareOriginal] = useState(false);
  const [diagnosis, setDiagnosis] = useState<string | null>(null);
  const [appliedNotice, setAppliedNotice] = useState(false);
  const [imageReady, setImageReady] = useState(false);

  const originalImageRef = useRef<HTMLImageElement | null>(null);
  const lastExternalUrlRef = useRef<string>('');
  const lastEmittedUrlRef = useRef<string>('');
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Load original image whenever a genuinely new source image is provided (ignoring our own applied data URL)
  useEffect(() => {
    if (!sourceImageUrl) {
      originalImageRef.current = null;
      setImageReady(false);
      return;
    }
    if (sourceImageUrl === lastEmittedUrlRef.current) {
      return;
    }

    lastExternalUrlRef.current = sourceImageUrl;
    setAdjustments(DEFAULT_ADJUSTMENTS);
    setDiagnosis(null);
    setAppliedNotice(false);
    setCompareOriginal(false);
    setImageReady(false);

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      originalImageRef.current = img;
      setImageReady(true);
    };
    img.src = sourceImageUrl;
  }, [sourceImageUrl]);

  // Re-render canvas preview whenever editor is open or adjustments change
  useEffect(() => {
    if (!isOpen || !imageReady || !originalImageRef.current || !previewCanvasRef.current) return;
    renderProcessedToCanvas(
      originalImageRef.current,
      previewCanvasRef.current,
      compareOriginal ? DEFAULT_ADJUSTMENTS : adjustments,
      560
    );
  }, [isOpen, imageReady, adjustments, compareOriginal]);

  const commitEnhancedImage = useCallback(
    (nextAdj: ImageAdjustments) => {
      const img = originalImageRef.current;
      if (!img) return;
      const exportCanvas = document.createElement('canvas');
      renderProcessedToCanvas(img, exportCanvas, nextAdj, 960);
      const dataUrl = exportCanvas.toDataURL('image/jpeg', 0.88);
      lastEmittedUrlRef.current = dataUrl;
      onApplyEnhancedImage(dataUrl);
      setAppliedNotice(true);
    },
    [onApplyEnhancedImage]
  );

  const handleAutoEnhance = () => {
    const img = originalImageRef.current;
    if (!img) return;
    const { suggested, diagnosis: diag } = analyzeHistogram(img);
    const nextAdj: ImageAdjustments = {
      ...adjustments,
      brightness: suggested.brightness ?? 10,
      contrast: suggested.contrast ?? 15,
      saturation: suggested.saturation ?? 12,
      sharpness: suggested.sharpness ?? 30,
    };
    setAdjustments(nextAdj);
    setCompareOriginal(false);
    setDiagnosis(diag);
    setIsOpen(true);
    commitEnhancedImage(nextAdj);
  };

  const applyPreset = (label: string, preset: Partial<ImageAdjustments>) => {
    const nextAdj: ImageAdjustments = {
      ...adjustments,
      brightness: preset.brightness ?? 0,
      contrast: preset.contrast ?? 0,
      saturation: preset.saturation ?? 0,
      sharpness: preset.sharpness ?? 0,
    };
    setAdjustments(nextAdj);
    setCompareOriginal(false);
    setDiagnosis(`Predefinição aplicada: ${label}`);
    setAppliedNotice(false);
  };

  const handleReset = () => {
    setAdjustments(DEFAULT_ADJUSTMENTS);
    setCompareOriginal(false);
    setDiagnosis(null);
    if (lastExternalUrlRef.current) {
      lastEmittedUrlRef.current = lastExternalUrlRef.current;
      onApplyEnhancedImage(lastExternalUrlRef.current);
    }
    setAppliedNotice(false);
  };

  const handleRotate = () => {
    const nextRotation = ((adjustments.rotation + 90) % 360) as 0 | 90 | 180 | 270;
    setAdjustments((prev) => ({ ...prev, rotation: nextRotation }));
    setAppliedNotice(false);
  };

  const hasChanges =
    adjustments.brightness !== 0 ||
    adjustments.contrast !== 0 ||
    adjustments.saturation !== 0 ||
    adjustments.sharpness !== 0 ||
    adjustments.rotation !== 0;

  return (
    <div className="mt-3 space-y-3">
      {/* Compact Preview + Action Strip */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <img
          src={sourceImageUrl}
          alt="Pré-visualização do produto"
          className="h-36 w-52 rounded-lg object-cover border border-[#DCE5DE] shrink-0"
        />

        <div className="space-y-2 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleAutoEnhance}
              disabled={!imageReady}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#14532D] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#15803D] disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              <Wand2 className="w-3.5 h-3.5 text-[#FACC15]" />
              Melhoria Automática
            </button>

            <button
              type="button"
              onClick={() => setIsOpen((v) => !v)}
              disabled={!imageReady}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#D4DDD6] bg-white px-3 py-1.5 text-xs font-semibold text-[#1C2720] hover:bg-[#F2F7F3] disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-[#15803D]" />
              {isOpen ? 'Ocultar Editor' : 'Ajustar Brilho e Contraste'}
            </button>
          </div>

          <p className="text-[11px] text-[#546459] leading-relaxed">
            Analisa o histograma da fotografia para corrigir luz, contraste e nitidez dos produtos agrícolas antes da publicação.
          </p>

          {diagnosis && (
            <div className="text-[11px] font-medium text-[#14532D] flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[#CA8A04] shrink-0" />
              <span>{diagnosis}</span>
            </div>
          )}

          {appliedNotice && (
            <div className="text-[11px] font-semibold text-[#15803D] flex items-center gap-1">
              <Check className="w-3.5 h-3.5" />
              Fotografia melhorada pronta para publicação.
            </div>
          )}
        </div>
      </div>

      {/* Expandable Canvas Editor */}
      {isOpen && imageReady && (
        <div className="rounded-xl border border-[#DCE5DE] bg-[#FAFDFB] p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#EDF2EE] pb-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={handleAutoEnhance}
                className="rounded-md border border-[#15803D]/40 bg-[#EEF7F0] px-2.5 py-1 text-[11px] font-semibold text-[#14532D] hover:bg-[#DCFCE7]"
              >
                Auto Histograma
              </button>
              <button
                type="button"
                onClick={() =>
                  applyPreset('Colheita Fresca', {
                    brightness: 10,
                    contrast: 18,
                    saturation: 16,
                    sharpness: 35,
                  })
                }
                className="rounded-md border border-[#D4DDD6] bg-white px-2.5 py-1 text-[11px] font-medium text-[#1C2720] hover:bg-[#F2F7F3]"
              >
                Colheita Fresca
              </button>
              <button
                type="button"
                onClick={() =>
                  applyPreset('Luz de Armazém', {
                    brightness: 22,
                    contrast: 20,
                    saturation: 8,
                    sharpness: 30,
                  })
                }
                className="rounded-md border border-[#D4DDD6] bg-white px-2.5 py-1 text-[11px] font-medium text-[#1C2720] hover:bg-[#F2F7F3]"
              >
                Luz de Armazém
              </button>
              <button
                type="button"
                onClick={handleRotate}
                className="inline-flex items-center gap-1 rounded-md border border-[#D4DDD6] bg-white px-2.5 py-1 text-[11px] font-medium text-[#1C2720] hover:bg-[#F2F7F3]"
              >
                <RotateCw className="w-3 h-3" />
                Rodar 90°
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCompareOriginal((v) => !v)}
                className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                  compareOriginal
                    ? 'border-[#CA8A04] bg-[#FEFCE8] text-[#713F12]'
                    : 'border-[#D4DDD6] bg-white text-[#445449] hover:text-[#111814]'
                }`}
              >
                <Eye className="w-3 h-3" />
                {compareOriginal ? 'A ver Original' : 'Comparar Original'}
              </button>

              <button
                type="button"
                onClick={handleReset}
                disabled={!hasChanges}
                className="inline-flex items-center gap-1 rounded-md border border-[#D4DDD6] bg-white px-2.5 py-1 text-[11px] font-medium text-[#445449] hover:text-[#111814] disabled:opacity-40"
              >
                <RotateCcw className="w-3 h-3" />
                Repor
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
            {/* Live Canvas Preview */}
            <div className="md:col-span-6 flex flex-col items-center justify-center rounded-lg border border-[#DCE5DE] bg-[#F2F7F3] p-2 overflow-hidden">
              <canvas
                ref={previewCanvasRef}
                className="max-h-56 max-w-full rounded object-contain"
              />
              <span className="mt-1.5 text-[10px] font-medium text-[#546459]">
                {compareOriginal ? 'Imagem Original (sem ajustes)' : 'Pré-visualização em Tempo Real'}
              </span>
            </div>

            {/* Sliders */}
            <div className="md:col-span-6 space-y-3">
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-semibold text-[#1C2720] inline-flex items-center gap-1">
                    <Sun className="w-3.5 h-3.5 text-[#CA8A04]" />
                    Brilho
                  </span>
                  <span className="font-mono-tabular text-[#546459]">
                    {adjustments.brightness > 0 ? `+${adjustments.brightness}%` : `${adjustments.brightness}%`}
                  </span>
                </div>
                <input
                  type="range"
                  min={-40}
                  max={45}
                  value={adjustments.brightness}
                  onChange={(e) => {
                    setCompareOriginal(false);
                    setAppliedNotice(false);
                    setAdjustments((prev) => ({ ...prev, brightness: Number(e.target.value) }));
                  }}
                  className="w-full accent-[#14532D] cursor-pointer"
                />
              </div>

              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-semibold text-[#1C2720]">Contraste</span>
                  <span className="font-mono-tabular text-[#546459]">
                    {adjustments.contrast > 0 ? `+${adjustments.contrast}%` : `${adjustments.contrast}%`}
                  </span>
                </div>
                <input
                  type="range"
                  min={-30}
                  max={50}
                  value={adjustments.contrast}
                  onChange={(e) => {
                    setCompareOriginal(false);
                    setAppliedNotice(false);
                    setAdjustments((prev) => ({ ...prev, contrast: Number(e.target.value) }));
                  }}
                  className="w-full accent-[#14532D] cursor-pointer"
                />
              </div>

              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-semibold text-[#1C2720]">Saturação (Cores Naturais)</span>
                  <span className="font-mono-tabular text-[#546459]">
                    {adjustments.saturation > 0 ? `+${adjustments.saturation}%` : `${adjustments.saturation}%`}
                  </span>
                </div>
                <input
                  type="range"
                  min={-30}
                  max={45}
                  value={adjustments.saturation}
                  onChange={(e) => {
                    setCompareOriginal(false);
                    setAppliedNotice(false);
                    setAdjustments((prev) => ({ ...prev, saturation: Number(e.target.value) }));
                  }}
                  className="w-full accent-[#14532D] cursor-pointer"
                />
              </div>

              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-semibold text-[#1C2720]">Nitidez / Detalhe</span>
                  <span className="font-mono-tabular text-[#546459]">{adjustments.sharpness}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={adjustments.sharpness}
                  onChange={(e) => {
                    setCompareOriginal(false);
                    setAppliedNotice(false);
                    setAdjustments((prev) => ({ ...prev, sharpness: Number(e.target.value) }));
                  }}
                  className="w-full accent-[#14532D] cursor-pointer"
                />
              </div>

              <div className="pt-1 flex justify-end">
                <button
                  type="button"
                  onClick={() => commitEnhancedImage(adjustments)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#14532D] px-4 py-2 text-xs font-bold text-white hover:bg-[#15803D] transition-colors whitespace-nowrap"
                >
                  <Check className="w-3.5 h-3.5" />
                  Aplicar Foto Melhorada
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useEffect, useRef, useState } from 'react';
import { Eraser, Paintbrush, RotateCcw, Save, Undo2, X } from 'lucide-react';

interface PhotoMaskEditorProps {
  title: string;
  imageUrl: string;
  onClose: () => void;
  onSave: (maskedDataUrl: string) => Promise<void>;
}

export const PhotoMaskEditor: React.FC<PhotoMaskEditorProps> = ({ title, imageUrl, onClose, onSave }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const originalCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [tool, setTool] = useState<'brush' | 'eraser'>('brush');
  const [brushSize, setBrushSize] = useState(26);
  const [isDrawing, setIsDrawing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [history, setHistory] = useState<ImageData[]>([]);

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const maxWidth = 760;
      const scale = img.width > maxWidth ? maxWidth / img.width : 1;
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);

      const display = canvasRef.current;
      if (!display) return;
      display.width = w;
      display.height = h;

      const orig = document.createElement('canvas');
      orig.width = w;
      orig.height = h;
      const origCtx = orig.getContext('2d');
      if (origCtx) origCtx.drawImage(img, 0, 0, w, h);
      originalCanvasRef.current = orig;

      const mask = document.createElement('canvas');
      mask.width = w;
      mask.height = h;
      maskCanvasRef.current = mask;

      renderComposite();
      setLoaded(true);
    };
    img.src = imageUrl;
  }, [imageUrl]);

  const renderComposite = () => {
    const display = canvasRef.current;
    const orig = originalCanvasRef.current;
    const mask = maskCanvasRef.current;
    if (!display || !orig || !mask) return;
    const ctx = display.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, display.width, display.height);
    ctx.drawImage(orig, 0, 0);
    ctx.drawImage(mask, 0, 0);
  };

  const getPointerCoords = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const pushHistory = () => {
    const mask = maskCanvasRef.current;
    if (!mask) return;
    const ctx = mask.getContext('2d');
    if (!ctx) return;
    const snap = ctx.getImageData(0, 0, mask.width, mask.height);
    setHistory((prev) => [...prev.slice(-14), snap]);
  };

  const paintAt = (x: number, y: number) => {
    const mask = maskCanvasRef.current;
    if (!mask) return;
    const ctx = mask.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
    if (tool === 'brush') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#14532D';
      ctx.fill();
      // Diagonal subtle privacy hatch inside brush stroke
      ctx.strokeStyle = '#0F3D21';
      ctx.lineWidth = 2;
      ctx.stroke();
    } else {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0,0,0,1)';
      ctx.fill();
    }
    ctx.restore();
    renderComposite();
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!loaded) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pushHistory();
    setIsDrawing(true);
    const { x, y } = getPointerCoords(e);
    paintAt(x, y);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const { x, y } = getPointerCoords(e);
    paintAt(x, y);
  };

  const handlePointerUp = () => {
    setIsDrawing(false);
  };

  const handleUndo = () => {
    if (history.length === 0 || !maskCanvasRef.current) return;
    const prev = history[history.length - 1];
    const ctx = maskCanvasRef.current.getContext('2d');
    if (ctx) {
      ctx.putImageData(prev, 0, 0);
      renderComposite();
    }
    setHistory((h) => h.slice(0, -1));
  };

  const handleReset = () => {
    if (!maskCanvasRef.current) return;
    pushHistory();
    const ctx = maskCanvasRef.current.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, maskCanvasRef.current.width, maskCanvasRef.current.height);
      renderComposite();
    }
  };

  const handleSave = async () => {
    if (!canvasRef.current) return;
    setSaving(true);
    try {
      const dataUrl = canvasRef.current.toDataURL('image/jpeg', 0.88);
      await onSave(dataUrl);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-3xl overflow-hidden rounded-xl border border-[#D4DDD6] bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-[#E5ECE6] px-5 py-3.5">
          <div>
            <h3 className="text-base font-semibold text-[#111814]">
              Ferramenta de Mascaramento de Dados Sensíveis
            </h3>
            <p className="text-xs text-[#546459] truncate max-w-md">{title}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-[#546459] hover:bg-[#EEF3EF] hover:text-[#111814]"
            aria-label="Fechar editor"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E5ECE6] bg-[#F7F9F7] px-5 py-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setTool('brush')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                tool === 'brush'
                  ? 'bg-[#14532D] text-white'
                  : 'border border-[#D4DDD6] bg-white text-[#1C2720] hover:bg-[#EEF3EF]'
              }`}
            >
              <Paintbrush className="w-3.5 h-3.5" />
              Pincel (Mascarar)
            </button>
            <button
              type="button"
              onClick={() => setTool('eraser')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                tool === 'eraser'
                  ? 'bg-[#EAB308] text-[#111814]'
                  : 'border border-[#D4DDD6] bg-white text-[#1C2720] hover:bg-[#EEF3EF]'
              }`}
            >
              <Eraser className="w-3.5 h-3.5" />
              Borracha (Restaurar)
            </button>
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs font-medium text-[#1C2720]">
              <span>Tamanho:</span>
              <input
                type="range"
                min={10}
                max={64}
                value={brushSize}
                onChange={(e) => setBrushSize(Number(e.target.value))}
                className="w-24 accent-[#15803D]"
              />
              <span className="font-mono-tabular w-8 text-right">{brushSize}px</span>
            </label>

            <button
              type="button"
              onClick={handleUndo}
              disabled={history.length === 0}
              className="inline-flex items-center gap-1 rounded-lg border border-[#D4DDD6] bg-white px-2.5 py-1.5 text-xs font-medium text-[#1C2720] disabled:opacity-40 hover:bg-[#EEF3EF]"
            >
              <Undo2 className="w-3.5 h-3.5" />
              Desfazer
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-1 rounded-lg border border-[#D4DDD6] bg-white px-2.5 py-1.5 text-xs font-medium text-[#1C2720] hover:bg-[#EEF3EF]"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Limpar
            </button>
          </div>
        </div>

        <div className="flex items-center justify-center bg-[#1C2720] p-4 max-h-[58vh] overflow-auto">
          <canvas
            ref={canvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            className="max-w-full rounded border border-white/10 touch-none cursor-crosshair bg-white"
          />
        </div>

        <div className="flex items-center justify-between border-t border-[#E5ECE6] px-5 py-3.5 bg-white">
          <p className="text-xs text-[#546459]">
            Passe o pincel sobre telefones, matrículas ou dados sensíveis na fotografia antes de guardar.
          </p>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[#D4DDD6] px-4 py-2 text-xs font-semibold text-[#1C2720] hover:bg-[#F7F9F7] whitespace-nowrap"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !loaded}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#15803D] px-4 py-2 text-xs font-semibold text-white hover:bg-[#14532D] disabled:opacity-50 whitespace-nowrap"
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? 'A guardar...' : 'Guardar Foto Mascarada'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

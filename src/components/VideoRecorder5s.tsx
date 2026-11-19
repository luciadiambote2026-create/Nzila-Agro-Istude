import React, { useEffect, useRef, useState } from 'react';
import { Camera, RotateCcw, Square, Upload, Video } from 'lucide-react';
import { fileToDataUrl } from '../lib/api';

interface VideoRecorder5sProps {
  label: string;
  value: string;
  onChange: (dataUrl: string) => void;
  helperText?: string;
}

export const VideoRecorder5s: React.FC<VideoRecorder5sProps> = ({
  label,
  value,
  onChange,
  helperText = 'Grave um mini-vídeo de 5 segundos com o rosto visível ou carregue um vídeo curto (até 5s).',
}) => {
  const [mode, setMode] = useState<'idle' | 'previewing' | 'recording'>('idle');
  const [countdown, setCountdown] = useState(5);
  const [error, setError] = useState<string | null>(null);
  const liveVideoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  const stopStream = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  useEffect(() => {
    return () => stopStream();
  }, []);

  const startCamera = async () => {
    setError(null);
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError('A câmara não está disponível neste navegador. Utilize o carregamento de vídeo curto.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      streamRef.current = stream;
      setMode('previewing');
      setTimeout(() => {
        if (liveVideoRef.current) {
          liveVideoRef.current.srcObject = stream;
          liveVideoRef.current.play().catch(() => {});
        }
      }, 60);
    } catch {
      setError('Permissão de câmara recusada ou dispositivo sem câmara. Carregue um mini-vídeo pelo botão abaixo.');
    }
  };

  const beginRecording = () => {
    if (!streamRef.current) return;
    setError(null);
    chunksRef.current = [];
    setCountdown(5);
    setMode('recording');

    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp8')
      ? 'video/webm;codecs=vp8'
      : MediaRecorder.isTypeSupported('video/webm')
      ? 'video/webm'
      : '';

    const recorder = mimeType
      ? new MediaRecorder(streamRef.current, { mimeType, videoBitsPerSecond: 450000 })
      : new MediaRecorder(streamRef.current);

    recorderRef.current = recorder;

    recorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) {
        chunksRef.current.push(ev.data);
      }
    };

    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeType || 'video/webm' });
      const reader = new FileReader();
      reader.onload = () => {
        onChange(String(reader.result));
        stopStream();
        setMode('idle');
      };
      reader.readAsDataURL(blob);
    };

    recorder.start(250);

    let remaining = 5;
    timerRef.current = window.setInterval(() => {
      remaining -= 1;
      setCountdown(remaining);
      if (remaining <= 0) {
        if (timerRef.current) {
          window.clearInterval(timerRef.current);
          timerRef.current = null;
        }
        if (recorderRef.current && recorderRef.current.state === 'recording') {
          recorderRef.current.stop();
        }
      }
    }, 1000);
  };

  const stopRecordingEarly = () => {
    if (recorderRef.current && recorderRef.current.state === 'recording') {
      recorderRef.current.stop();
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('video/')) {
      setError('Selecione um ficheiro de vídeo válido (MP4, WebM, MOV).');
      return;
    }

    if (file.size > 12 * 1024 * 1024) {
      setError('O mini-vídeo excede 12 MB. Grave ou selecione um vídeo curto de 5 segundos.');
      return;
    }

    try {
      const objectUrl = URL.createObjectURL(file);
      const vid = document.createElement('video');
      vid.preload = 'metadata';
      vid.onloadedmetadata = async () => {
        URL.revokeObjectURL(objectUrl);
        if (vid.duration > 7.5) {
          setError(`O vídeo tem ${vid.duration.toFixed(1)}s. Deve ser um mini-vídeo de até 5 segundos.`);
          return;
        }
        const dataUrl = await fileToDataUrl(file);
        onChange(dataUrl);
      };
      vid.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        setError('Não foi possível validar a duração do vídeo.');
      };
      vid.src = objectUrl;
    } catch {
      setError('Erro ao carregar o ficheiro de vídeo.');
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <label className="block text-sm font-medium text-[#1C2720]">{label}</label>
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="inline-flex items-center gap-1 text-xs font-medium text-[#546459] hover:text-[#14532D] transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Refazer vídeo
          </button>
        )}
      </div>

      <p className="text-xs text-[#546459]">{helperText}</p>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      {value ? (
        <div className="overflow-hidden rounded-lg border border-[#D4DDD6] bg-[#111814]">
          <video src={value} controls className="w-full max-h-48 object-cover" />
          <div className="flex items-center justify-between bg-[#EEF3EF] px-3 py-1.5 text-xs text-[#14532D] font-medium">
            <span>Mini-vídeo de confirmação pronto</span>
            <span>Validado</span>
          </div>
        </div>
      ) : mode === 'idle' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={startCamera}
            className="flex items-center justify-center gap-2 rounded-lg border border-[#15803D] bg-[#F2F7F3] px-3.5 py-2.5 text-sm font-medium text-[#14532D] hover:bg-[#E4EFE6] transition-colors whitespace-nowrap"
          >
            <Camera className="w-4 h-4 shrink-0" />
            Gravar 5s na Câmara
          </button>

          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-[#D4DDD6] bg-white px-3.5 py-2.5 text-sm font-medium text-[#1C2720] hover:bg-[#F7F9F7] transition-colors whitespace-nowrap">
            <Upload className="w-4 h-4 shrink-0" />
            Carregar Vídeo (5s)
            <input type="file" accept="video/*" onChange={handleFileUpload} className="hidden" />
          </label>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-[#15803D] bg-[#111814]">
          <div className="relative">
            <video ref={liveVideoRef} muted playsInline className="w-full max-h-52 object-cover" />
            {mode === 'recording' && (
              <div className="absolute top-3 right-3 rounded-md bg-red-600 px-2.5 py-1 text-xs font-semibold text-white font-mono-tabular">
                A gravar: {countdown}s
              </div>
            )}
          </div>
          <div className="flex items-center justify-between gap-3 bg-[#14532D] px-3.5 py-2.5">
            {mode === 'previewing' ? (
              <>
                <span className="text-xs text-white/90">Câmara pronta para gravação de 5 segundos</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      stopStream();
                      setMode('idle');
                    }}
                    className="rounded-md px-3 py-1.5 text-xs font-medium text-white/80 hover:text-white"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={beginRecording}
                    className="inline-flex items-center gap-1.5 rounded-md bg-[#FACC15] px-3 py-1.5 text-xs font-semibold text-[#111814] hover:bg-[#EAB308] transition-colors whitespace-nowrap"
                  >
                    <Video className="w-3.5 h-3.5" />
                    Iniciar (5s)
                  </button>
                </div>
              </>
            ) : (
              <>
                <span className="text-xs text-white">Mantenha o rosto visível até concluir...</span>
                <button
                  type="button"
                  onClick={stopRecordingEarly}
                  className="inline-flex items-center gap-1.5 rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-[#111814] hover:bg-neutral-100 whitespace-nowrap"
                >
                  <Square className="w-3.5 h-3.5" />
                  Concluir
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

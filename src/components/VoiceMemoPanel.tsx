import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Copy,
  Mic,
  MicOff,
  Save,
  Search,
  Square,
  Trash2,
  Volume2,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import type { User } from '../types';

interface VoiceMemo {
  id: number;
  userId: number;
  title: string;
  transcript: string;
  category: string;
  language: string;
  durationSeconds: number;
  createdAt: string;
}

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionErrorEventLike {
  error: string;
}

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

const getSpeechRecognitionCtor = (): SpeechRecognitionConstructor | null => {
  if (typeof window === 'undefined') return null;
  const win = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return win.SpeechRecognition || win.webkitSpeechRecognition || null;
};

const NOTE_CATEGORIES = [
  'Campo / Lavra',
  'Colheita',
  'Pragas & Clima',
  'Vendas & Preços',
  'Insumos',
] as const;

const LANGUAGES = [
  { code: 'pt-PT', label: 'Português (Angola / PT)' },
  { code: 'pt-BR', label: 'Português (Brasil)' },
  { code: 'en-US', label: 'English (US)' },
] as const;

const formatTimer = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
};

interface VoiceMemoPanelProps {
  user: User;
}

export const VoiceMemoPanel: React.FC<VoiceMemoPanelProps> = ({ user }) => {
  const [memos, setMemos] = useState<VoiceMemo[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<string>('Campo / Lavra');
  const [language, setLanguage] = useState<string>('pt-PT');
  const [transcript, setTranscript] = useState('');
  const [interimText, setInterimText] = useState('');

  const [isRecording, setIsRecording] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const shouldKeepListeningRef = useRef(false);
  const timerRef = useRef<number | null>(null);

  const speechSupported = useMemo(() => Boolean(getSpeechRecognitionCtor()), []);

  const loadMemos = async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{ memos: VoiceMemo[] }>('/api/users/voice-memos');
      setMemos(res.memos);
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao carregar notas de voz guardadas.',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMemos();
    return () => {
      shouldKeepListeningRef.current = false;
      recognitionRef.current?.abort();
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, []);

  const stopDictation = () => {
    shouldKeepListeningRef.current = false;
    setIsRecording(false);
    setInterimText('');
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    try {
      recognitionRef.current?.stop();
    } catch {
      // Ignore already-stopped errors
    }
    recognitionRef.current = null;
  };

  const startDictation = () => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setFeedback({
        type: 'err',
        text: 'O seu navegador não suporta a API SpeechRecognition. Pode escrever a nota manualmente abaixo.',
      });
      return;
    }

    setFeedback(null);
    shouldKeepListeningRef.current = true;

    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = language;

    recognition.onstart = () => {
      setIsRecording(true);
      if (!timerRef.current) {
        timerRef.current = window.setInterval(() => {
          setElapsedSeconds((prev) => prev + 1);
        }, 1000);
      }
    };

    recognition.onresult = (event) => {
      let finalChunk = '';
      let interimChunk = '';

      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const piece = result[0]?.transcript || '';
        if (result.isFinal) {
          finalChunk += `${piece.trim()} `;
        } else {
          interimChunk += piece;
        }
      }

      if (finalChunk.trim()) {
        setTranscript((prev) => {
          const base = prev.trim();
          return base ? `${base} ${finalChunk.trim()}` : finalChunk.trim();
        });
      }
      setInterimText(interimChunk.trim());
    };

    recognition.onerror = (event) => {
      const errorCode = event.error;
      if (errorCode === 'not-allowed' || errorCode === 'service-not-allowed') {
        setFeedback({
          type: 'err',
          text: 'Permissão de microfone recusada. Autorize o acesso ao microfone no navegador para ditar notas.',
        });
        stopDictation();
      } else if (errorCode === 'no-speech') {
        // Silent pause: keep listening if user hasn't stopped
      } else if (errorCode !== 'aborted') {
        setFeedback({
          type: 'err',
          text: `Erro no reconhecimento de voz (${errorCode}). Tente novamente.`,
        });
        stopDictation();
      }
    };

    recognition.onend = () => {
      setInterimText('');
      if (shouldKeepListeningRef.current) {
        try {
          recognition.start();
        } catch {
          stopDictation();
        }
      } else {
        setIsRecording(false);
        if (timerRef.current) {
          window.clearInterval(timerRef.current);
          timerRef.current = null;
        }
      }
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      setFeedback({ type: 'err', text: 'Não foi possível iniciar o microfone. Tente novamente.' });
      stopDictation();
    }
  };

  const handleSaveMemo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isRecording) stopDictation();

    const fullText = [transcript.trim(), interimText.trim()].filter(Boolean).join(' ').trim();
    if (!fullText) {
      setFeedback({ type: 'err', text: 'Dite ou escreva a sua nota de campo antes de guardar.' });
      return;
    }

    setSaving(true);
    setFeedback(null);
    try {
      const res = await apiRequest<{ memo: VoiceMemo }>('/api/users/voice-memos', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim() || `Nota de Campo · ${user.province} (${new Date().toLocaleDateString('pt-AO')})`,
          transcript: fullText,
          category,
          language,
          durationSeconds: elapsedSeconds,
        }),
      });
      if (res.memo) {
        setMemos((prev) => [res.memo, ...prev]);
      } else {
        await loadMemos();
      }
      setTitle('');
      setTranscript('');
      setInterimText('');
      setElapsedSeconds(0);
      setFeedback({ type: 'ok', text: 'Nota de voz guardada diretamente no seu perfil.' });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao guardar nota de voz.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteMemo = async (id: number) => {
    try {
      await apiRequest(`/api/users/voice-memos/${id}`, { method: 'DELETE' });
      setMemos((prev) => prev.filter((m) => m.id !== id));
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao eliminar nota de voz.',
      });
    }
  };

  const handleCopyMemo = async (memo: VoiceMemo) => {
    try {
      await navigator.clipboard.writeText(`${memo.title}\n${memo.transcript}`);
      setCopiedId(memo.id);
      window.setTimeout(() => setCopiedId((curr) => (curr === memo.id ? null : curr)), 1800);
    } catch {
      // Ignore clipboard failures
    }
  };

  const filteredMemos = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return memos;
    return memos.filter(
      (m) =>
        m.title.toLowerCase().includes(q) ||
        m.transcript.toLowerCase().includes(q) ||
        m.category.toLowerCase().includes(q)
    );
  }, [memos, searchQuery]);

  return (
    <div className="space-y-6">
      {feedback && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            feedback.type === 'ok'
              ? 'border-[#15803D]/30 bg-[#EEF7F0] text-[#14532D]'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {feedback.text}
        </div>
      )}

      {/* Dictation Composer Card */}
      <form onSubmit={handleSaveMemo} className="rounded-xl border border-[#DCE5DE] bg-white p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#EDF2EE] pb-4">
          <div>
            <h2 className="font-display text-lg font-bold text-[#111814] flex items-center gap-2">
              <Mic className="w-5 h-5 text-[#15803D]" />
              Notas de Voz (Diário de Campo)
            </h2>
            <p className="text-xs text-[#546459] mt-0.5">
              Dite notas rápidas diretamente da lavra usando o microfone e guarde-as automaticamente no seu perfil.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <select
              value={language}
              disabled={isRecording}
              onChange={(e) => setLanguage(e.target.value)}
              aria-label="Idioma do reconhecimento de voz"
              className="rounded-lg border border-[#D4DDD6] bg-white px-2.5 py-2 text-xs font-medium text-[#1C2720] focus:border-[#15803D] focus:outline-none disabled:opacity-60"
            >
              {LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {!speechSupported && (
          <div className="rounded-lg border border-[#EAB308]/50 bg-[#FEFCE8] px-4 py-3 text-xs text-[#713F12] flex items-center gap-2">
            <MicOff className="w-4 h-4 text-[#CA8A04] shrink-0" />
            <span>
              Este navegador não suporta ditado por voz (SpeechRecognition). Utilize Chrome ou Edge para ditar, ou registe as suas notas de campo manualmente abaixo.
            </span>
          </div>
        )}

        {/* Voice Control Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-[#DCE5DE] bg-[#F7F9F7] p-4">
          <div className="flex items-center gap-3">
            {isRecording ? (
              <button
                type="button"
                onClick={stopDictation}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-red-700 transition-colors"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                Parar Ditado
              </button>
            ) : (
              <button
                type="button"
                disabled={!speechSupported}
                onClick={startDictation}
                className="inline-flex items-center gap-2 rounded-lg bg-[#14532D] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#15803D] disabled:opacity-50 transition-colors"
              >
                <Mic className="w-4 h-4" />
                Iniciar Ditado por Voz
              </button>
            )}

            <div className="text-xs">
              {isRecording ? (
                <div className="flex items-center gap-2 font-semibold text-red-700">
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-600 animate-pulse" />
                  A escutar... <span className="font-mono-tabular">{formatTimer(elapsedSeconds)}</span>
                </div>
              ) : (
                <div className="text-[#546459]">
                  {elapsedSeconds > 0
                    ? `Duração ditada: ${formatTimer(elapsedSeconds)}`
                    : 'Pronto para gravar nota de campo'}
                </div>
              )}
            </div>
          </div>

          {transcript && !isRecording && (
            <button
              type="button"
              onClick={() => {
                setTranscript('');
                setInterimText('');
                setElapsedSeconds(0);
              }}
              className="text-xs font-semibold text-[#546459] hover:text-red-700 self-start sm:self-center"
            >
              Limpar rascunho
            </button>
          )}
        </div>

        {/* Metadata & Transcript */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-[#1C2720] mb-1">
              Título da Nota (opcional)
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={`Ex: Inspeção lavra de milho · ${user.province}`}
              className="w-full rounded-lg border border-[#D4DDD6] px-3.5 py-2 text-sm text-[#111814] focus:border-[#15803D] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#1C2720] mb-1">Categoria</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-lg border border-[#D4DDD6] bg-white px-3 py-2 text-sm text-[#111814] focus:border-[#15803D] focus:outline-none"
            >
              {NOTE_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-[#1C2720] mb-1">
            Transcrição da Nota de Campo *
          </label>
          <textarea
            rows={4}
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            placeholder="Clique em 'Iniciar Ditado por Voz' e fale naturalmente sobre colheitas, irrigação, preços ou insumos..."
            className="w-full rounded-lg border border-[#D4DDD6] px-3.5 py-2.5 text-sm text-[#111814] focus:border-[#15803D] focus:outline-none"
          />
          {interimText && (
            <div className="mt-1.5 flex items-center gap-1.5 text-xs italic text-[#15803D]">
              <Volume2 className="w-3.5 h-3.5 shrink-0" />
              <span>A transcrever: &ldquo;{interimText}&rdquo;</span>
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving || (!transcript.trim() && !interimText.trim())}
            className="inline-flex items-center gap-2 rounded-lg bg-[#14532D] px-5 py-2.5 text-xs font-bold text-white hover:bg-[#15803D] disabled:opacity-50 transition-colors"
          >
            <Save className="w-4 h-4" />
            {saving ? 'A guardar...' : 'Guardar Nota no Perfil'}
          </button>
        </div>
      </form>

      {/* Saved Field Notes List */}
      <div className="rounded-xl border border-[#DCE5DE] bg-white p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-base font-bold text-[#111814]">
              Notas Guardadas no Perfil ({memos.length})
            </h3>
            <p className="text-xs text-[#546459]">
              Histórico pessoal das suas anotações de campo sincronizado com a sua conta.
            </p>
          </div>

          {memos.length > 0 && (
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[#7B8B80] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Pesquisar notas..."
                className="w-full sm:w-56 rounded-lg border border-[#D4DDD6] bg-white pl-8 pr-3 py-1.5 text-xs text-[#111814] focus:border-[#15803D] focus:outline-none"
              />
            </div>
          )}
        </div>

        {loading ? (
          <p className="text-xs text-[#546459]">A carregar notas de voz...</p>
        ) : filteredMemos.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[#C7D3CA] bg-[#F7F9F7] p-6 text-center text-xs text-[#546459]">
            {memos.length === 0
              ? 'Ainda não guardou nenhuma nota de voz. Use o microfone acima para ditar a sua primeira nota de campo.'
              : 'Nenhuma nota encontrada para a pesquisa indicada.'}
          </div>
        ) : (
          <div className="divide-y divide-[#EDF2EE]">
            {filteredMemos.map((memo) => (
              <div key={memo.id} className="py-4 space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h4 className="font-display text-sm font-bold text-[#111814]">{memo.title}</h4>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-[#546459]">
                      <span className="font-semibold text-[#14532D]">{memo.category}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono-tabular">
                        {new Date(memo.createdAt).toLocaleString('pt-AO')}
                      </span>
                      {memo.durationSeconds > 0 && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono-tabular">{formatTimer(memo.durationSeconds)}</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleCopyMemo(memo)}
                      className="inline-flex items-center gap-1 rounded-lg border border-[#D4DDD6] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#1C2720] hover:bg-[#F2F7F3]"
                    >
                      {copiedId === memo.id ? (
                        <>
                          <Check className="w-3 h-3 text-[#15803D]" />
                          Copiado
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          Copiar
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteMemo(memo.id)}
                      className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="w-3 h-3" />
                      Eliminar
                    </button>
                  </div>
                </div>

                <p className="text-sm text-[#1C2720] whitespace-pre-wrap leading-relaxed bg-[#F7F9F7] rounded-lg border border-[#EDF2EE] px-3.5 py-2.5">
                  {memo.transcript}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

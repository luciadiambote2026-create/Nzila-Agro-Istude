import React, { useState } from 'react';
import { ShieldCheck, Upload, UserPlus, X } from 'lucide-react';
import { ANGOLA_PROVINCES, apiRequest, compressImageFileToDataUrl, setStoredToken } from '../lib/api';
import {
  loadPersistedAccountsVault,
  savePersistedActiveUser,
  upsertPersistedAccount,
} from '../lib/localAuthStore';
import type { User } from '../types';
import { PasswordInput } from './PasswordInput';
import { VideoRecorder5s } from './VideoRecorder5s';

interface AuthModalProps {
  initialMode: 'login' | 'register' | 'recovery';
  hasAnyUser: boolean;
  onClose: () => void;
  onAuthenticated: (user: User, notice?: string) => void;
  onRecoverySubmitted?: (email: string) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  initialMode,
  hasAnyUser,
  onClose,
  onAuthenticated,
  onRecoverySubmitted,
}) => {
  const [mode, setMode] = useState<'login' | 'register' | 'recovery'>(initialMode);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Login state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Register state (all 10 mandatory fields)
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regName, setRegName] = useState('');
  const [regAge, setRegAge] = useState('28');
  const [regProvince, setRegProvince] = useState('Luanda');
  const [regProfession, setRegProfession] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regWhatsapp, setRegWhatsapp] = useState('');
  const [regPhoto, setRegPhoto] = useState('');
  const [regVideo, setRegVideo] = useState('');

  // Recovery state
  const [recEmail, setRecEmail] = useState('');
  const [recPassword, setRecPassword] = useState('');
  const [recVideo, setRecVideo] = useState('');
  const [recStatusLookup, setRecStatusLookup] = useState<string | null>(null);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const dataUrl = await compressImageFileToDataUrl(file, 640, 0.85);
      setRegPhoto(dataUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao processar fotografia de perfil.');
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setLoading(true);
    try {
      const res = await apiRequest<{ token: string; user: User }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });
      setStoredToken(res.token);
      upsertPersistedAccount(res.user, loginPassword);
      savePersistedActiveUser(res.user);
      onAuthenticated(res.user);
    } catch (err) {
      // Fallback: if server database reset, restore saved localStorage accounts and retry login
      const vault = loadPersistedAccountsVault();
      const cleanEmail = loginEmail.trim().toLowerCase();
      const localMatch = vault.find(
        (acc) => acc.email === cleanEmail && (!acc.password || acc.password === loginPassword)
      );
      if (localMatch) {
        try {
          const restored = await apiRequest<{ restored: number; token: string | null; user: User | null }>(
            '/api/auth/restore-local-accounts',
            {
              method: 'POST',
              body: JSON.stringify({ accounts: vault, activeEmail: cleanEmail }),
            }
          );
          if (restored.token && restored.user) {
            setStoredToken(restored.token);
            upsertPersistedAccount(restored.user, loginPassword);
            savePersistedActiveUser(restored.user);
            onAuthenticated(restored.user);
            return;
          }
        } catch {
          // fall through to original error
        }
      }
      setError(err instanceof Error ? err.message : 'Erro ao iniciar sessão.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (!regPhoto) {
      setError('A fotografia de perfil é obrigatória.');
      return;
    }
    if (!regVideo) {
      setError('O mini-vídeo de verificação (5 segundos) é obrigatório.');
      return;
    }

    setLoading(true);
    try {
      const res = await apiRequest<{ token: string; user: User; isFirstPrincipalAdmin: boolean }>(
        '/api/auth/register',
        {
          method: 'POST',
          body: JSON.stringify({
            email: regEmail,
            password: regPassword,
            profilePhoto: regPhoto,
            verificationVideo: regVideo,
            name: regName,
            age: Number(regAge),
            province: regProvince,
            profession: regProfession,
            phone: regPhone,
            whatsapp: regWhatsapp,
          }),
        }
      );
      setStoredToken(res.token);
      upsertPersistedAccount(res.user, regPassword);
      savePersistedActiveUser(res.user);
      onAuthenticated(
        res.user,
        res.isFirstPrincipalAdmin
          ? 'Primeiro registo concluído: assumiu automaticamente o estatuto de Administrador Principal (guardado no armazenamento local).'
          : 'Registo submetido! A sua conta nasceu no estado Pendente até validação do vídeo pelo Administrador Principal.'
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao efetuar registo.');
    } finally {
      setLoading(false);
    }
  };

  const handleRecoverySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (!recVideo) {
      setError('O envio do novo mini-vídeo de confirmação de identidade é obrigatório.');
      return;
    }

    setLoading(true);
    try {
      const res = await apiRequest<{ success: boolean; message: string }>('/api/auth/recovery-request', {
        method: 'POST',
        body: JSON.stringify({
          email: recEmail,
          newPassword: recPassword,
          recoveryVideo: recVideo,
        }),
      });
      onRecoverySubmitted?.(recEmail.trim().toLowerCase());
      setSuccessMsg(res.message);
      setRecPassword('');
      setRecVideo('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao submeter pedido de recuperação.');
    } finally {
      setLoading(false);
    }
  };

  const checkRecoveryStatus = async () => {
    if (!recEmail.trim()) return;
    setError(null);
    try {
      const res = await apiRequest<{ found: boolean; status?: string; adminNotes?: string }>(
        `/api/auth/recovery-status?email=${encodeURIComponent(recEmail.trim())}`
      );
      if (!res.found) {
        setRecStatusLookup('Nenhum pedido de recuperação encontrado para este e-mail.');
      } else {
        setRecStatusLookup(
          `Estado atual do pedido: ${res.status}${res.adminNotes ? ` — Nota: ${res.adminNotes}` : ''}`
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao consultar estado.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 overflow-y-auto">
      <div className="my-8 w-full max-w-2xl overflow-hidden rounded-xl border border-[#D4DDD6] bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#E5ECE6] bg-[#14532D] px-6 py-4 text-white">
          <div>
            <h2 className="font-display text-lg font-bold">
              {mode === 'login' && 'Acesso à Plataforma Nzila Agro'}
              {mode === 'register' && 'Registo Obrigatório de Identidade'}
              {mode === 'recovery' && 'Recuperação de Conta Blindada'}
            </h2>
            <p className="text-xs text-white/80">
              {mode === 'login' && 'Entre com o seu e-mail e palavra-passe verificados.'}
              {mode === 'register' &&
                (!hasAnyUser
                  ? 'Primeiro registo da plataforma: assumirá o estatuto de Administrador Principal.'
                  : 'Registo sujeito a verificação de vídeo e aprovação administrativa.')}
              {mode === 'recovery' && 'Validação manual por mini-vídeo pelo Administrador Principal.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar janela"
            className="rounded-lg p-1.5 text-white/80 hover:bg-white/10 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Tabs */}
        <div className="flex items-center gap-1 border-b border-[#E5ECE6] bg-[#F7F9F7] px-6 py-2.5">
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setError(null);
              setSuccessMsg(null);
            }}
            className={`rounded-md px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
              mode === 'login' ? 'bg-white text-[#14532D] shadow-sm border border-[#D4DDD6]' : 'text-[#546459] hover:text-[#111814]'
            }`}
          >
            Iniciar Sessão
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('register');
              setError(null);
              setSuccessMsg(null);
            }}
            className={`rounded-md px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
              mode === 'register' ? 'bg-white text-[#14532D] shadow-sm border border-[#D4DDD6]' : 'text-[#546459] hover:text-[#111814]'
            }`}
          >
            Criar Conta
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('recovery');
              setError(null);
              setSuccessMsg(null);
            }}
            className={`rounded-md px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
              mode === 'recovery' ? 'bg-white text-[#14532D] shadow-sm border border-[#D4DDD6]' : 'text-[#546459] hover:text-[#111814]'
            }`}
          >
            Recuperar Palavra-passe
          </button>
        </div>

        <div className="p-6 max-h-[75vh] overflow-y-auto">
          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {successMsg && (
            <div className="mb-4 rounded-lg border border-[#15803D]/30 bg-[#EEF7F0] px-4 py-3 text-sm text-[#14532D]">
              {successMsg}
            </div>
          )}

          {mode === 'login' && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label htmlFor="login-email" className="block text-sm font-medium text-[#1C2720] mb-1.5">
                  E-mail
                </label>
                <input
                  id="login-email"
                  type="email"
                  required
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="exemplo@nzilaagro.ao"
                  className="w-full rounded-lg border border-[#D4DDD6] bg-white px-3.5 py-2.5 text-sm text-[#111814] focus:border-[#15803D] focus:outline-none focus:ring-2 focus:ring-[#15803D]/20"
                />
              </div>

              <PasswordInput
                id="login-password"
                label="Palavra-passe"
                value={loginPassword}
                onChange={setLoginPassword}
                required
                autoComplete="current-password"
              />

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setMode('recovery')}
                  className="text-xs font-medium text-[#15803D] hover:underline"
                >
                  Esqueceu a palavra-passe? Recuperação Blindada
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-lg bg-[#14532D] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#15803D] disabled:opacity-60 transition-colors whitespace-nowrap"
                >
                  {loading ? 'A entrar...' : 'Entrar no Painel'}
                </button>
              </div>
            </form>
          )}

          {mode === 'register' && (
            <form onSubmit={handleRegister} className="space-y-5">
              {!hasAnyUser && (
                <div className="flex items-start gap-3 rounded-lg border border-[#EAB308] bg-[#FEFCE8] px-4 py-3 text-xs text-[#713F12]">
                  <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-[#CA8A04]" />
                  <div>
                    <strong>Regra de Ouro de Acesso:</strong> Ainda não existem contas no sistema. Este primeiro
                    registo receberá automaticamente o estatuto de <strong>Administrador Principal</strong>.
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="reg-name" className="block text-sm font-medium text-[#1C2720] mb-1.5">
                    Nome completo *
                  </label>
                  <input
                    id="reg-name"
                    type="text"
                    required
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    placeholder="Ex: Mateus Kambala"
                    className="w-full rounded-lg border border-[#D4DDD6] px-3.5 py-2.5 text-sm focus:border-[#15803D] focus:outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="reg-email" className="block text-sm font-medium text-[#1C2720] mb-1.5">
                    E-mail *
                  </label>
                  <input
                    id="reg-email"
                    type="email"
                    required
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    placeholder="produtor@dominio.ao"
                    className="w-full rounded-lg border border-[#D4DDD6] px-3.5 py-2.5 text-sm focus:border-[#15803D] focus:outline-none"
                  />
                </div>

                <div>
                  <PasswordInput
                    id="reg-password"
                    label="Palavra-passe (mín. 6 caracteres) *"
                    value={regPassword}
                    onChange={setRegPassword}
                    required
                    minLength={6}
                    autoComplete="new-password"
                  />
                </div>

                <div>
                  <label htmlFor="reg-age" className="block text-sm font-medium text-[#1C2720] mb-1.5">
                    Idade (mín. 18 anos) *
                  </label>
                  <input
                    id="reg-age"
                    type="number"
                    min={18}
                    max={110}
                    required
                    value={regAge}
                    onChange={(e) => setRegAge(e.target.value)}
                    className="w-full rounded-lg border border-[#D4DDD6] px-3.5 py-2.5 text-sm tabular-nums focus:border-[#15803D] focus:outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="reg-province" className="block text-sm font-medium text-[#1C2720] mb-1.5">
                    Província *
                  </label>
                  <select
                    id="reg-province"
                    value={regProvince}
                    onChange={(e) => setRegProvince(e.target.value)}
                    className="w-full rounded-lg border border-[#D4DDD6] bg-white px-3.5 py-2.5 text-sm focus:border-[#15803D] focus:outline-none"
                  >
                    {ANGOLA_PROVINCES.map((prov) => (
                      <option key={prov} value={prov}>
                        {prov}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="reg-profession" className="block text-sm font-medium text-[#1C2720] mb-1.5">
                    Profissão *
                  </label>
                  <input
                    id="reg-profession"
                    type="text"
                    required
                    value={regProfession}
                    onChange={(e) => setRegProfession(e.target.value)}
                    placeholder="Ex: Agricultor / Eng. Agrónomo"
                    className="w-full rounded-lg border border-[#D4DDD6] px-3.5 py-2.5 text-sm focus:border-[#15803D] focus:outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="reg-phone" className="block text-sm font-medium text-[#1C2720] mb-1.5">
                    Telefone *
                  </label>
                  <input
                    id="reg-phone"
                    type="tel"
                    required
                    value={regPhone}
                    onChange={(e) => setRegPhone(e.target.value)}
                    placeholder="+244 923 000 000"
                    className="w-full rounded-lg border border-[#D4DDD6] px-3.5 py-2.5 text-sm font-mono-tabular focus:border-[#15803D] focus:outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="reg-whatsapp" className="block text-sm font-medium text-[#1C2720] mb-1.5">
                    WhatsApp *
                  </label>
                  <input
                    id="reg-whatsapp"
                    type="tel"
                    required
                    value={regWhatsapp}
                    onChange={(e) => setRegWhatsapp(e.target.value)}
                    placeholder="+244 923 000 000"
                    className="w-full rounded-lg border border-[#D4DDD6] px-3.5 py-2.5 text-sm font-mono-tabular focus:border-[#15803D] focus:outline-none"
                  />
                </div>
              </div>

              {/* Foto de perfil obrigatória */}
              <div className="space-y-2 border-t border-[#E5ECE6] pt-4">
                <label className="block text-sm font-medium text-[#1C2720]">Foto de Perfil *</label>
                <div className="flex items-center gap-4">
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-[#D4DDD6] bg-[#F2F7F3] flex items-center justify-center">
                    {regPhoto ? (
                      <img src={regPhoto} alt="Pré-visualização do perfil" className="h-full w-full object-cover" />
                    ) : (
                      <UserPlus className="w-6 h-6 text-[#7B8B80]" />
                    )}
                  </div>
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[#D4DDD6] bg-white px-4 py-2 text-xs font-semibold text-[#1C2720] hover:bg-[#F7F9F7] transition-colors">
                    <Upload className="w-4 h-4 text-[#15803D]" />
                    {regPhoto ? 'Substituir Fotografia' : 'Carregar Foto de Perfil'}
                    <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
                  </label>
                </div>
              </div>

              {/* Mini-vídeo obrigatório de 5 segundos */}
              <div className="border-t border-[#E5ECE6] pt-4">
                <VideoRecorder5s
                  label="Mini-vídeo de Verificação (5 segundos) *"
                  value={regVideo}
                  onChange={setRegVideo}
                />
              </div>

              <div className="flex justify-end border-t border-[#E5ECE6] pt-4">
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-lg bg-[#14532D] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#15803D] disabled:opacity-60 transition-colors whitespace-nowrap"
                >
                  {loading ? 'A registar...' : 'Submeter Registo Completo'}
                </button>
              </div>
            </form>
          )}

          {mode === 'recovery' && (
            <form onSubmit={handleRecoverySubmit} className="space-y-4">
              <div className="rounded-lg border border-[#EAB308]/50 bg-[#FEFCE8] px-4 py-3 text-xs text-[#713F12]">
                Por segurança rigorosa, a recuperação exige o envio de um <strong>novo mini-vídeo de confirmação de identidade</strong>.
                O pedido ficará <strong>Pendente</strong> até validação manual pelo Administrador Principal.
              </div>

              <div>
                <label htmlFor="rec-email" className="block text-sm font-medium text-[#1C2720] mb-1.5">
                  E-mail da conta *
                </label>
                <div className="flex gap-2">
                  <input
                    id="rec-email"
                    type="email"
                    required
                    value={recEmail}
                    onChange={(e) => setRecEmail(e.target.value)}
                    placeholder="conta@nzilaagro.ao"
                    className="flex-1 rounded-lg border border-[#D4DDD6] px-3.5 py-2.5 text-sm focus:border-[#15803D] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={checkRecoveryStatus}
                    className="rounded-lg border border-[#D4DDD6] bg-[#F7F9F7] px-3.5 py-2 text-xs font-semibold text-[#1C2720] hover:bg-[#EEF3EF] whitespace-nowrap"
                  >
                    Ver Estado
                  </button>
                </div>
                {recStatusLookup && (
                  <p className="mt-1.5 text-xs font-medium text-[#14532D]">{recStatusLookup}</p>
                )}
              </div>

              <PasswordInput
                id="rec-password"
                label="Nova palavra-passe pretendida (mín. 6 caracteres) *"
                value={recPassword}
                onChange={setRecPassword}
                required
                minLength={6}
              />

              <VideoRecorder5s
                label="Novo Mini-vídeo de Confirmação de Identidade (5 segundos) *"
                value={recVideo}
                onChange={setRecVideo}
                helperText="O Administrador Principal irá comparar este vídeo com o seu registo original antes de aprovar a nova palavra-passe."
              />

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-lg bg-[#14532D] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#15803D] disabled:opacity-60 transition-colors whitespace-nowrap"
                >
                  {loading ? 'A enviar pedido...' : 'Enviar Pedido Blindado'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

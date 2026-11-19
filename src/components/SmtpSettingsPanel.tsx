import React, { useEffect, useState } from 'react';
import { CheckCircle2, Mail, Send } from 'lucide-react';
import { apiRequest } from '../lib/api';
import type { SmtpSettings } from '../types';
import { PasswordInput } from './PasswordInput';

export const SmtpSettingsPanel: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [host, setHost] = useState('');
  const [port, setPort] = useState('587');
  const [secure, setSecure] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [hasPassword, setHasPassword] = useState(false);
  const [fromName, setFromName] = useState('Nzila Agro');
  const [fromEmail, setFromEmail] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [notifyOnApproval, setNotifyOnApproval] = useState(true);
  const [notifyOnRecovery, setNotifyOnRecovery] = useState(true);
  const [updatedAt, setUpdatedAt] = useState('');
  const [testEmail, setTestEmail] = useState('');

  const loadSmtp = async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{ smtp: SmtpSettings }>('/api/admin/principal/smtp');
      const s = res.smtp;
      setHost(s.host);
      setPort(String(s.port || 587));
      setSecure(s.secure);
      setUsername(s.username);
      setHasPassword(s.hasPassword);
      setFromName(s.fromName || 'Nzila Agro');
      setFromEmail(s.fromEmail);
      setEnabled(s.enabled);
      setNotifyOnApproval(s.notifyOnApproval);
      setNotifyOnRecovery(s.notifyOnRecovery);
      setUpdatedAt(s.updatedAt);
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Erro ao carregar configuração SMTP.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSmtp();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    setSaving(true);
    try {
      const res = await apiRequest<{ smtp: SmtpSettings; message: string }>('/api/admin/principal/smtp', {
        method: 'PUT',
        body: JSON.stringify({
          host,
          port: Number(port) || 587,
          secure,
          username,
          password: password || undefined,
          fromName,
          fromEmail,
          enabled,
          notifyOnApproval,
          notifyOnRecovery,
        }),
      });
      setHasPassword(res.smtp.hasPassword);
      setUpdatedAt(res.smtp.updatedAt);
      setPassword('');
      setFeedback({ type: 'ok', text: res.message || 'Configuração SMTP guardada com sucesso.' });
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Erro ao guardar configuração SMTP.' });
    } finally {
      setSaving(false);
    }
  };

  const handleSendTest = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    setTesting(true);
    try {
      const res = await apiRequest<{ message: string }>('/api/admin/principal/smtp/test', {
        method: 'POST',
        body: JSON.stringify({ toEmail: testEmail.trim() || undefined }),
      });
      setFeedback({ type: 'ok', text: res.message });
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Falha ao enviar e-mail de teste.' });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-[#DCE5DE] bg-white p-8 text-sm text-[#546459]">
        A carregar configuração SMTP...
      </div>
    );
  }

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

      <form onSubmit={handleSave} className="rounded-xl border border-[#DCE5DE] bg-white p-6 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#EDF2EE] pb-4">
          <div>
            <h2 className="font-display text-lg font-bold text-[#111814] flex items-center gap-2">
              <Mail className="w-5 h-5 text-[#15803D]" />
              Configuração SMTP e Notificações por E-mail
            </h2>
            <p className="text-xs text-[#546459] mt-0.5">
              Configure o servidor SMTP oficial para envio automático de e-mails quando contas forem aprovadas ou pedidos de recuperação de senha forem submetidos/processados.
            </p>
          </div>
          {updatedAt && (
            <span className="text-[11px] font-mono-tabular text-[#546459]">
              Atualizado: {new Date(updatedAt + (updatedAt.endsWith('Z') ? '' : 'Z')).toLocaleString('pt-AO')}
            </span>
          )}
        </div>

        {/* Master Switch */}
        <label className="flex items-start gap-3 rounded-lg border border-[#DCE5DE] bg-[#F7F9F7] p-4 cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-[#14532D]"
          />
          <div>
            <div className="text-sm font-bold text-[#111814]">
              Ativar envio automático de notificações por e-mail (SMTP)
            </div>
            <div className="text-xs text-[#546459] mt-0.5">
              Quando ativo, a plataforma envia e-mails institucionais em segundo plano sem bloquear as operações administrativas.
            </div>
          </div>
        </label>

        {/* Connection Credentials */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="sm:col-span-2 lg:col-span-2">
            <label className="block text-xs font-medium text-[#1C2720] mb-1">Servidor SMTP (Host)</label>
            <input
              type="text"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="Ex: smtp.gmail.com ou smtp.zoho.com"
              className="w-full rounded-lg border border-[#D4DDD6] px-3.5 py-2.5 text-sm font-mono-tabular focus:border-[#15803D] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#1C2720] mb-1">Porta SMTP</label>
            <input
              type="number"
              min="1"
              max="65535"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              placeholder="587"
              className="w-full rounded-lg border border-[#D4DDD6] px-3.5 py-2.5 text-sm font-mono-tabular focus:border-[#15803D] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#1C2720] mb-1">Utilizador SMTP (Login)</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="notificacoes@nzilaagro.ao"
              className="w-full rounded-lg border border-[#D4DDD6] px-3.5 py-2.5 text-sm focus:border-[#15803D] focus:outline-none"
            />
          </div>

          <div>
            <PasswordInput
              id="smtp-password-input"
              label={hasPassword ? 'Palavra-passe SMTP (guardada — opcional)' : 'Palavra-passe / App Password SMTP'}
              value={password}
              onChange={setPassword}
              placeholder={hasPassword ? 'Deixe em branco para manter a atual' : '••••••••••••'}
            />
          </div>

          <div className="flex items-end pb-2">
            <label className="inline-flex items-center gap-2 text-xs font-medium text-[#1C2720] cursor-pointer">
              <input
                type="checkbox"
                checked={secure}
                onChange={(e) => setSecure(e.target.checked)}
                className="h-4 w-4 accent-[#14532D]"
              />
              Usar SSL/TLS direto (porta 465)
            </label>
          </div>
        </div>

        {/* Sender Identity */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-[#EDF2EE] pt-4">
          <div>
            <label className="block text-xs font-medium text-[#1C2720] mb-1">Nome do Remetente</label>
            <input
              type="text"
              value={fromName}
              onChange={(e) => setFromName(e.target.value)}
              placeholder="Nzila Agro"
              className="w-full rounded-lg border border-[#D4DDD6] px-3.5 py-2.5 text-sm focus:border-[#15803D] focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#1C2720] mb-1">E-mail do Remetente</label>
            <input
              type="email"
              value={fromEmail}
              onChange={(e) => setFromEmail(e.target.value)}
              placeholder="notificacoes@nzilaagro.ao"
              className="w-full rounded-lg border border-[#D4DDD6] px-3.5 py-2.5 text-sm focus:border-[#15803D] focus:outline-none"
            />
          </div>
        </div>

        {/* Automatic Event Triggers */}
        <div className="border-t border-[#EDF2EE] pt-4 space-y-2.5">
          <div className="text-xs font-bold text-[#14532D]">Eventos de Notificação Automática</div>
          <label className="flex items-center gap-2.5 text-xs text-[#1C2720] cursor-pointer">
            <input
              type="checkbox"
              checked={notifyOnApproval}
              onChange={(e) => setNotifyOnApproval(e.target.checked)}
              className="h-4 w-4 accent-[#14532D]"
            />
            Enviar e-mail automático ao utilizador quando o seu registo for aprovado pela administração
          </label>
          <label className="flex items-center gap-2.5 text-xs text-[#1C2720] cursor-pointer">
            <input
              type="checkbox"
              checked={notifyOnRecovery}
              onChange={(e) => setNotifyOnRecovery(e.target.checked)}
              className="h-4 w-4 accent-[#14532D]"
            />
            Enviar e-mail automático em pedidos de recuperação blindada e na decisão final do Administrador Principal
          </label>
        </div>

        <div className="flex justify-end border-t border-[#EDF2EE] pt-4">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-[#14532D] px-6 py-2.5 text-xs font-bold text-white hover:bg-[#15803D] disabled:opacity-50 transition-colors"
          >
            <CheckCircle2 className="w-4 h-4" />
            {saving ? 'A guardar...' : 'Guardar Configuração SMTP'}
          </button>
        </div>
      </form>

      {/* SMTP Connection Test Card */}
      <form onSubmit={handleSendTest} className="rounded-xl border border-[#DCE5DE] bg-white p-6 space-y-4">
        <div>
          <h3 className="font-display text-base font-bold text-[#111814]">Testar Ligação e Envio SMTP</h3>
          <p className="text-xs text-[#546459] mt-0.5">
            Envie um e-mail de verificação utilizando as credenciais SMTP guardadas acima. Se deixar em branco, será enviado para o seu e-mail de Administrador Principal.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <input
            type="email"
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
            placeholder="E-mail de destino para teste (opcional)"
            className="flex-1 rounded-lg border border-[#D4DDD6] px-3.5 py-2.5 text-sm focus:border-[#15803D] focus:outline-none"
          />
          <button
            type="submit"
            disabled={testing}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#EAB308] px-5 py-2.5 text-xs font-bold text-[#111814] hover:bg-[#CA8A04] hover:text-white disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
          >
            <Send className="w-3.5 h-3.5" />
            {testing ? 'A testar ligação...' : 'Enviar E-mail de Teste'}
          </button>
        </div>
      </form>
    </div>
  );
};

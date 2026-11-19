import os from 'node:os';
import { db, recordAuditLog } from './db.ts';
import { sendPlatformEmail } from './mailer.ts';
import { sendCriticalSmsAlert } from './smsGateway.ts';

export interface CriticalAlertSettings {
  enabled: boolean;
  cpuThresholdPct: number;
  memoryThresholdPct: number;
  durationMinutes: number;
  cooldownMinutes: number;
  notifyInApp: boolean;
  notifyEmail: boolean;
  notifySms: boolean;
  alertEmail: string;
  updatedAt?: string;
}

export interface CriticalAlertLogEntry {
  id: number;
  metric: string;
  currentValue: number;
  thresholdValue: number;
  sustainedSeconds: number;
  channels: string;
  message: string;
  isTest: boolean;
  createdAt: string;
}

export interface ServerMetricHistoryPoint {
  timestamp: string;
  cpuPercent: number;
  memoryPercent: number;
  cpuPeakPercent: number;
  memoryPeakPercent: number;
  memoryUsedMb: number;
  memoryTotalMb: number;
  samples: number;
}

export interface ServerMetricHistoryResponse {
  hours: number;
  sampleIntervalSeconds: number;
  windowStart: string;
  windowEnd: string;
  totalSamples: number;
  summary: {
    avgCpu: number;
    maxCpu: number;
    avgMemory: number;
    maxMemory: number;
  };
  points: ServerMetricHistoryPoint[];
}

let lastCpuSnapshot: { idle: number; total: number } | null = null;
let cpuBreachStartedAt: number | null = null;
let memoryBreachStartedAt: number | null = null;
let lastCpuAlertAt = 0;
let lastMemoryAlertAt = 0;
let lastMetricSampleSavedAt = 0;
let watchdogTimer: NodeJS.Timeout | null = null;

function parseSqliteUtcDate(value: string): string {
  const iso = value.includes('T') ? value : `${value.replace(' ', 'T')}Z`;
  return new Date(iso).toISOString();
}

function readCpuTotals(): { idle: number; total: number } {
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;
  for (const cpu of cpus) {
    idle += cpu.times.idle;
    total += cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.idle + cpu.times.irq;
  }
  return { idle, total };
}

export function getCriticalAlertSettings(): CriticalAlertSettings {
  const row = db
    .prepare('SELECT * FROM critical_alert_settings WHERE id = 1')
    .get() as Record<string, unknown> | undefined;

  if (!row) {
    db.prepare(
      `INSERT OR IGNORE INTO critical_alert_settings
       (id, enabled, cpu_threshold_pct, memory_threshold_pct, duration_minutes, cooldown_minutes, notify_in_app, notify_email, notify_sms, alert_email)
       VALUES (1, 1, 85, 85, 5, 30, 1, 1, 0, '')`
    ).run();
    return {
      enabled: true,
      cpuThresholdPct: 85,
      memoryThresholdPct: 85,
      durationMinutes: 5,
      cooldownMinutes: 30,
      notifyInApp: true,
      notifyEmail: true,
      notifySms: false,
      alertEmail: '',
    };
  }

  return {
    enabled: Number(row.enabled) === 1,
    cpuThresholdPct: Math.min(99, Math.max(50, Number(row.cpu_threshold_pct ?? 85))),
    memoryThresholdPct: Math.min(99, Math.max(50, Number(row.memory_threshold_pct ?? 85))),
    durationMinutes: Math.min(60, Math.max(1, Math.floor(Number(row.duration_minutes ?? 5)))),
    cooldownMinutes: Math.min(240, Math.max(5, Math.floor(Number(row.cooldown_minutes ?? 30)))),
    notifyInApp: Number(row.notify_in_app) === 1,
    notifyEmail: Number(row.notify_email) === 1,
    notifySms: Number(row.notify_sms) === 1,
    alertEmail: String(row.alert_email || ''),
    updatedAt: row.updated_at ? parseSqliteUtcDate(String(row.updated_at)) : undefined,
  };
}

export function updateCriticalAlertSettings(input: Partial<CriticalAlertSettings>): CriticalAlertSettings {
  const current = getCriticalAlertSettings();
  const next: CriticalAlertSettings = {
    enabled: typeof input.enabled === 'boolean' ? input.enabled : current.enabled,
    cpuThresholdPct:
      input.cpuThresholdPct !== undefined
        ? Math.min(99, Math.max(50, Number(input.cpuThresholdPct)))
        : current.cpuThresholdPct,
    memoryThresholdPct:
      input.memoryThresholdPct !== undefined
        ? Math.min(99, Math.max(50, Number(input.memoryThresholdPct)))
        : current.memoryThresholdPct,
    durationMinutes:
      input.durationMinutes !== undefined
        ? Math.min(60, Math.max(1, Math.floor(Number(input.durationMinutes))))
        : current.durationMinutes,
    cooldownMinutes:
      input.cooldownMinutes !== undefined
        ? Math.min(240, Math.max(5, Math.floor(Number(input.cooldownMinutes))))
        : current.cooldownMinutes,
    notifyInApp: typeof input.notifyInApp === 'boolean' ? input.notifyInApp : current.notifyInApp,
    notifyEmail: typeof input.notifyEmail === 'boolean' ? input.notifyEmail : current.notifyEmail,
    notifySms: typeof input.notifySms === 'boolean' ? input.notifySms : current.notifySms,
    alertEmail: typeof input.alertEmail === 'string' ? input.alertEmail.trim() : current.alertEmail,
  };

  db.prepare(
    `INSERT INTO critical_alert_settings
     (id, enabled, cpu_threshold_pct, memory_threshold_pct, duration_minutes, cooldown_minutes, notify_in_app, notify_email, notify_sms, alert_email, updated_at)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET
       enabled = excluded.enabled,
       cpu_threshold_pct = excluded.cpu_threshold_pct,
       memory_threshold_pct = excluded.memory_threshold_pct,
       duration_minutes = excluded.duration_minutes,
       cooldown_minutes = excluded.cooldown_minutes,
       notify_in_app = excluded.notify_in_app,
       notify_email = excluded.notify_email,
       notify_sms = excluded.notify_sms,
       alert_email = excluded.alert_email,
       updated_at = datetime('now')`
  ).run(
    next.enabled ? 1 : 0,
    next.cpuThresholdPct,
    next.memoryThresholdPct,
    next.durationMinutes,
    next.cooldownMinutes,
    next.notifyInApp ? 1 : 0,
    next.notifyEmail ? 1 : 0,
    next.notifySms ? 1 : 0,
    next.alertEmail
  );

  // Reset ongoing breach counters when thresholds change
  cpuBreachStartedAt = null;
  memoryBreachStartedAt = null;

  return getCriticalAlertSettings();
}

export function getCriticalAlertLogs(limit = 25): CriticalAlertLogEntry[] {
  const rows = db
    .prepare('SELECT * FROM critical_alert_logs ORDER BY id DESC LIMIT ?')
    .all(limit) as Record<string, unknown>[];

  return rows.map((row) => ({
    id: Number(row.id),
    metric: String(row.metric || ''),
    currentValue: Number(row.current_value || 0),
    thresholdValue: Number(row.threshold_value || 85),
    sustainedSeconds: Number(row.sustained_seconds || 0),
    channels: String(row.channels || 'In-App'),
    message: String(row.message || ''),
    isTest: Number(row.is_test) === 1,
    createdAt: parseSqliteUtcDate(String(row.created_at)),
  }));
}

export function getMonitorBreachState() {
  const now = Date.now();
  return {
    cpuBreaching: cpuBreachStartedAt !== null,
    cpuSustainedSeconds: cpuBreachStartedAt ? Math.floor((now - cpuBreachStartedAt) / 1000) : 0,
    memoryBreaching: memoryBreachStartedAt !== null,
    memorySustainedSeconds: memoryBreachStartedAt ? Math.floor((now - memoryBreachStartedAt) / 1000) : 0,
  };
}

export function getSystemHealthSnapshot() {
  const currentCpu = readCpuTotals();
  let cpuUsagePercent = 0;

  if (lastCpuSnapshot) {
    const idleDelta = currentCpu.idle - lastCpuSnapshot.idle;
    const totalDelta = currentCpu.total - lastCpuSnapshot.total;
    if (totalDelta > 0) {
      cpuUsagePercent = Math.min(100, Math.max(0, Math.round(((totalDelta - idleDelta) / totalDelta) * 1000) / 10));
    }
  } else {
    const load1m = os.loadavg()[0] || 0;
    const cores = Math.max(1, os.cpus().length);
    cpuUsagePercent = Math.min(100, Math.max(0, Math.round((load1m / cores) * 1000) / 10));
  }
  lastCpuSnapshot = currentCpu;

  const totalMemBytes = os.totalmem();
  const freeMemBytes = os.freemem();
  const usedMemBytes = Math.max(0, totalMemBytes - freeMemBytes);
  const memUsagePercent = totalMemBytes > 0 ? Math.round((usedMemBytes / totalMemBytes) * 1000) / 10 : 0;

  const procMem = process.memoryUsage();
  const dbStart = performance.now();
  db.prepare('SELECT 1 AS ok').get();
  const dbLatencyMs = Math.round((performance.now() - dbStart) * 100) / 100;

  const cpus = os.cpus();
  return {
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    nodeVersion: process.version,
    platform: `${os.type()} ${os.arch()}`,
    cpu: {
      usagePercent: cpuUsagePercent,
      cores: cpus.length,
      model: cpus[0]?.model?.trim() || 'CPU',
      loadAvg1m: Math.round((os.loadavg()[0] || 0) * 100) / 100,
    },
    memory: {
      usagePercent: memUsagePercent,
      usedMb: Math.round(usedMemBytes / (1024 * 1024)),
      totalMb: Math.round(totalMemBytes / (1024 * 1024)),
      processRssMb: Math.round(procMem.rss / (1024 * 1024)),
      processHeapUsedMb: Math.round(procMem.heapUsed / (1024 * 1024)),
      processHeapTotalMb: Math.round(procMem.heapTotal / (1024 * 1024)),
    },
    database: {
      latencyMs: dbLatencyMs,
    },
    breachState: getMonitorBreachState(),
  };
}

export function recordServerMetricSample(force = false): void {
  const now = Date.now();
  if (!force && now - lastMetricSampleSavedAt < 60_000) {
    return;
  }
  try {
    const snap = getSystemHealthSnapshot();
    db.prepare(
      `INSERT INTO server_metric_history
       (cpu_percent, memory_percent, memory_used_mb, memory_total_mb, load_avg_1m, db_latency_ms, recorded_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
    ).run(
      snap.cpu.usagePercent,
      snap.memory.usagePercent,
      snap.memory.usedMb,
      snap.memory.totalMb,
      snap.cpu.loadAvg1m,
      snap.database.latencyMs
    );
    lastMetricSampleSavedAt = now;

    // Keep last 48 hours of samples so the table remains compact
    db.prepare(`DELETE FROM server_metric_history WHERE recorded_at < datetime('now', '-48 hours')`).run();
  } catch (err) {
    console.error('[Nzila Agro Monitor] Erro ao guardar amostra histórica de métricas:', err);
  }
}

export function getServerMetricHistory(hours = 24): ServerMetricHistoryResponse {
  const clampedHours = Math.min(24, Math.max(1, Math.floor(hours)));
  const now = new Date();
  const windowStart = new Date(now.getTime() - clampedHours * 60 * 60 * 1000);

  let rows = db
    .prepare(
      `SELECT cpu_percent, memory_percent, memory_used_mb, memory_total_mb, recorded_at
       FROM server_metric_history
       WHERE recorded_at >= datetime('now', ?)
       ORDER BY recorded_at ASC`
    )
    .all(`-${clampedHours} hours`) as Array<Record<string, unknown>>;

  // Ensure at least one real live sample exists immediately on first request
  if (rows.length === 0) {
    recordServerMetricSample(true);
    rows = db
      .prepare(
        `SELECT cpu_percent, memory_percent, memory_used_mb, memory_total_mb, recorded_at
         FROM server_metric_history
         WHERE recorded_at >= datetime('now', ?)
         ORDER BY recorded_at ASC`
      )
      .all(`-${clampedHours} hours`) as Array<Record<string, unknown>>;
  }

  let sumCpu = 0;
  let maxCpu = 0;
  let sumMem = 0;
  let maxMem = 0;

  const parsedRows = rows.map((r) => {
    const cpu = Number(r.cpu_percent || 0);
    const mem = Number(r.memory_percent || 0);
    sumCpu += cpu;
    sumMem += mem;
    if (cpu > maxCpu) maxCpu = cpu;
    if (mem > maxMem) maxMem = mem;
    const iso = parseSqliteUtcDate(String(r.recorded_at));
    return {
      tsMs: new Date(iso).getTime(),
      timestamp: iso,
      cpu,
      mem,
      usedMb: Number(r.memory_used_mb || 0),
      totalMb: Number(r.memory_total_mb || 0),
    };
  });

  // Downsample into buckets when there are more than 96 points so Recharts renders smoothly
  const bucketMs =
    parsedRows.length > 96
      ? Math.max(60_000, Math.ceil((clampedHours * 60 * 60 * 1000) / 96))
      : 0;

  let points: ServerMetricHistoryPoint[];
  if (bucketMs === 0) {
    points = parsedRows.map((p) => ({
      timestamp: p.timestamp,
      cpuPercent: Math.round(p.cpu * 10) / 10,
      memoryPercent: Math.round(p.mem * 10) / 10,
      cpuPeakPercent: Math.round(p.cpu * 10) / 10,
      memoryPeakPercent: Math.round(p.mem * 10) / 10,
      memoryUsedMb: p.usedMb,
      memoryTotalMb: p.totalMb,
      samples: 1,
    }));
  } else {
    const buckets = new Map<
      number,
      {
        cpuSum: number;
        memSum: number;
        cpuMax: number;
        memMax: number;
        usedMbSum: number;
        totalMb: number;
        count: number;
      }
    >();
    for (const p of parsedRows) {
      const key = Math.floor(p.tsMs / bucketMs) * bucketMs;
      const existing = buckets.get(key);
      if (!existing) {
        buckets.set(key, {
          cpuSum: p.cpu,
          memSum: p.mem,
          cpuMax: p.cpu,
          memMax: p.mem,
          usedMbSum: p.usedMb,
          totalMb: p.totalMb,
          count: 1,
        });
      } else {
        existing.cpuSum += p.cpu;
        existing.memSum += p.mem;
        if (p.cpu > existing.cpuMax) existing.cpuMax = p.cpu;
        if (p.mem > existing.memMax) existing.memMax = p.mem;
        existing.usedMbSum += p.usedMb;
        existing.totalMb = p.totalMb;
        existing.count += 1;
      }
    }

    points = Array.from(buckets.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([tsMs, b]) => ({
        timestamp: new Date(tsMs).toISOString(),
        cpuPercent: Math.round((b.cpuSum / b.count) * 10) / 10,
        memoryPercent: Math.round((b.memSum / b.count) * 10) / 10,
        cpuPeakPercent: Math.round(b.cpuMax * 10) / 10,
        memoryPeakPercent: Math.round(b.memMax * 10) / 10,
        memoryUsedMb: Math.round(b.usedMbSum / b.count),
        memoryTotalMb: b.totalMb,
        samples: b.count,
      }));
  }

  const count = parsedRows.length;
  return {
    hours: clampedHours,
    sampleIntervalSeconds: 60,
    windowStart: windowStart.toISOString(),
    windowEnd: now.toISOString(),
    totalSamples: count,
    summary: {
      avgCpu: count > 0 ? Math.round((sumCpu / count) * 10) / 10 : 0,
      maxCpu: Math.round(maxCpu * 10) / 10,
      avgMemory: count > 0 ? Math.round((sumMem / count) * 10) / 10 : 0,
      maxMemory: Math.round(maxMem * 10) / 10,
    },
    points,
  };
}

async function dispatchCriticalAlert(params: {
  metric: 'CPU' | 'Memória RAM';
  currentValue: number;
  thresholdValue: number;
  sustainedSeconds: number;
  settings: CriticalAlertSettings;
  isTest?: boolean;
}) {
  const { metric, currentValue, thresholdValue, sustainedSeconds, settings, isTest = false } = params;
  const durationLabel = `${Math.max(1, Math.round(sustainedSeconds / 60))} min`;
  const title = isTest
    ? `[TESTE] Alerta Crítico de Servidor — ${metric}`
    : `Alerta Crítico de Servidor: ${metric} acima de ${thresholdValue}%`;

  const message = isTest
    ? `Teste de notificação crítica configurado para disparar quando ${metric} ultrapassar ${thresholdValue}% por mais de ${settings.durationMinutes} minutos (valor atual: ${currentValue.toFixed(1)}%).`
    : `A utilização de ${metric} atingiu ${currentValue.toFixed(1)}% (limite: ${thresholdValue}%) de forma contínua durante ${durationLabel}. Recomenda-se inspeção imediata no Painel do Administrador Principal.`;

  const activeChannels: string[] = [];

  const principalAdmins = db
    .prepare("SELECT id, email, name FROM users WHERE role = 'ADMIN_PRINCIPAL'")
    .all() as Array<{ id: number; email: string; name: string }>;

  if (settings.notifyInApp) {
    activeChannels.push('Painel (In-App)');
    const insertNotif = db.prepare(
      `INSERT INTO notifications (user_id, type, title, message) VALUES (?, 'critical_alert', ?, ?)`
    );
    for (const admin of principalAdmins) {
      insertNotif.run(Number(admin.id), title, message);
    }
  }

  if (settings.notifyEmail) {
    const targetEmail = settings.alertEmail || principalAdmins[0]?.email || '';
    if (targetEmail) {
      activeChannels.push(`Email (${targetEmail})`);
      await sendPlatformEmail({
        to: targetEmail,
        subject: title,
        title,
        paragraphs: [
          message,
          `Limite configurado: ${thresholdValue}% por mais de ${settings.durationMinutes} minutos consecutivos.`,
          `Data/Hora (UTC): ${new Date().toISOString()}`,
        ],
        eventType: 'critical_alert',
      });
    }
  }

  if (settings.notifySms) {
    const smsText = `[Nzila Agro] ${title}: ${currentValue.toFixed(1)}% (limite ${thresholdValue}%). Verifique o Painel Admin.`;
    const smsResult = await sendCriticalSmsAlert({ message: smsText });
    if (smsResult.recipientPhone) {
      activeChannels.push(
        smsResult.sent ? `SMS (${smsResult.recipientPhone})` : `SMS falhou (${smsResult.recipientPhone})`
      );
    }
  }

  const channelsLabel = activeChannels.length > 0 ? activeChannels.join(' + ') : 'Registo Interno';

  db.prepare(
    `INSERT INTO critical_alert_logs (metric, current_value, threshold_value, sustained_seconds, channels, message, is_test)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(metric, currentValue, thresholdValue, sustainedSeconds, channelsLabel, message, isTest ? 1 : 0);

  recordAuditLog({
    actorId: null,
    actorName: isTest ? 'Administrador Principal' : 'Monitor do Servidor',
    actorRole: 'ADMIN_PRINCIPAL',
    category: 'Segurança',
    action: isTest ? 'Teste de Alerta Crítico de Servidor' : `Alerta Crítico Disparado (${metric})`,
    targetLabel: `${currentValue.toFixed(1)}% (limite ${thresholdValue}%)`,
    details: `${message} | Canais: ${channelsLabel}`,
  });
}

async function evaluateServerHealthWatchdog() {
  try {
    // Persist 1-minute historical telemetry sample regardless of alert toggle
    recordServerMetricSample(false);

    const settings = getCriticalAlertSettings();
    if (!settings.enabled) {
      cpuBreachStartedAt = null;
      memoryBreachStartedAt = null;
      return;
    }

    const snap = getSystemHealthSnapshot();
    const now = Date.now();
    const requiredMs = settings.durationMinutes * 60 * 1000;
    const cooldownMs = settings.cooldownMinutes * 60 * 1000;

    // Evaluate CPU
    if (snap.cpu.usagePercent >= settings.cpuThresholdPct) {
      if (cpuBreachStartedAt === null) {
        cpuBreachStartedAt = now;
      } else if (now - cpuBreachStartedAt >= requiredMs && now - lastCpuAlertAt >= cooldownMs) {
        lastCpuAlertAt = now;
        await dispatchCriticalAlert({
          metric: 'CPU',
          currentValue: snap.cpu.usagePercent,
          thresholdValue: settings.cpuThresholdPct,
          sustainedSeconds: Math.floor((now - cpuBreachStartedAt) / 1000),
          settings,
        });
      }
    } else {
      cpuBreachStartedAt = null;
    }

    // Evaluate Memory
    if (snap.memory.usagePercent >= settings.memoryThresholdPct) {
      if (memoryBreachStartedAt === null) {
        memoryBreachStartedAt = now;
      } else if (now - memoryBreachStartedAt >= requiredMs && now - lastMemoryAlertAt >= cooldownMs) {
        lastMemoryAlertAt = now;
        await dispatchCriticalAlert({
          metric: 'Memória RAM',
          currentValue: snap.memory.usagePercent,
          thresholdValue: settings.memoryThresholdPct,
          sustainedSeconds: Math.floor((now - memoryBreachStartedAt) / 1000),
          settings,
        });
      }
    } else {
      memoryBreachStartedAt = null;
    }
  } catch (err) {
    console.error('[Nzila Agro Monitor] Erro ao avaliar alertas críticos:', err);
  }
}

export async function sendTestCriticalAlert() {
  const settings = getCriticalAlertSettings();
  const snap = getSystemHealthSnapshot();
  await dispatchCriticalAlert({
    metric: 'CPU',
    currentValue: snap.cpu.usagePercent,
    thresholdValue: settings.cpuThresholdPct,
    sustainedSeconds: settings.durationMinutes * 60,
    settings,
    isTest: true,
  });
  return {
    settings,
    logs: getCriticalAlertLogs(),
    breachState: getMonitorBreachState(),
  };
}

export function startSystemAlertMonitor(): void {
  if (watchdogTimer) {
    clearInterval(watchdogTimer);
  }
  // Prime CPU snapshot, record initial historical point, and evaluate every 15 seconds
  getSystemHealthSnapshot();
  recordServerMetricSample(true);
  watchdogTimer = setInterval(() => {
    void evaluateServerHealthWatchdog();
  }, 15_000);
}

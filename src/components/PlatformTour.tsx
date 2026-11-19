import React, { useEffect, useRef } from 'react';
import { driver, type DriveStep, type Driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import type { User } from '../types';
import type { ActiveView } from './Navbar';

interface PlatformTourProps {
  user: User | null;
  activeView: ActiveView;
  replayRequestId: number;
  onTourFinished?: () => void;
}

const TOUR_STORAGE_PREFIX = 'nzila_platform_tour_done_v1_';

export function hasCompletedPlatformTour(userId: number): boolean {
  try {
    return localStorage.getItem(`${TOUR_STORAGE_PREFIX}${userId}`) === '1';
  } catch {
    return false;
  }
}

export function markPlatformTourCompleted(userId: number): void {
  try {
    localStorage.setItem(`${TOUR_STORAGE_PREFIX}${userId}`, '1');
  } catch {
    // Ignore storage errors
  }
}

function buildStepsForView(user: User, activeView: ActiveView): DriveStep[] {
  if (activeView === 'principal-panel' && user.role === 'ADMIN_PRINCIPAL') {
    return [
      {
        popover: {
          title: 'Bem-vindo ao Controlo Total da Nzila Agro',
          description:
            'Como Administrador Principal, tem supervisão completa sobre aprovações de identidade, finanças, cotas, campanhas, backups e auditoria da plataforma.',
          align: 'center',
        },
      },
      {
        element: '[data-tour="principal-counters"]',
        popover: {
          title: 'Contadores de Pendentes em Tempo Real',
          description:
            'Acompanhe de imediato quantos registos, pedidos de recuperação de senha, cotas inativas e mensagens de suporte aguardam a sua validação.',
          side: 'bottom',
          align: 'start',
        },
      },
      {
        element: '[data-tour="principal-tabs"]',
        popover: {
          title: 'Módulos Administrativos',
          description:
            'Navegue entre aprovação de vídeos de 5 segundos, recuperação blindada, edição financeira (IBAN, Express, WhatsApp), gestão de cotas/bónus, doações privadas, backups e logs de auditoria.',
          side: 'bottom',
          align: 'start',
        },
      },
      {
        element: '[data-tour="principal-backup-btn"]',
        popover: {
          title: 'Backup Sob Demanda (JSON)',
          description:
            'Descarregue a qualquer momento o estado completo da base de dados em formato JSON para arquivo local seguro.',
          side: 'left',
          align: 'start',
        },
      },
      {
        element: '[data-tour="nav-notifications"]',
        popover: {
          title: 'Centro de Notificações',
          description:
            'Consulte alertas importantes do sistema e alterne rapidamente entre os painéis administrativos e a Vitrine Pública.',
          side: 'bottom',
          align: 'end',
        },
      },
    ];
  }

  if (activeView === 'aux-panel' && (user.role === 'ADMIN_AUXILIAR' || user.role === 'ADMIN_PRINCIPAL')) {
    return [
      {
        popover: {
          title: 'Bem-vindo ao Painel do Administrador Auxiliar',
          description:
            'Este espaço reúne as ferramentas de moderação diária para manter a vitrine agrícola íntegra, segura e atualizada.',
          align: 'center',
        },
      },
      {
        element: '[data-tour="aux-tabs"]',
        popover: {
          title: 'Moderação, Contas e Suporte',
          description:
            'Alterne entre a moderação de produtos (com pincel e borracha para mascarar dados sensíveis nas fotos), gestão de contas e respostas de suporte.',
          side: 'bottom',
          align: 'end',
        },
      },
      {
        element: '[data-tour="nav-notifications"]',
        popover: {
          title: 'Alertas e Navegação Rápida',
          description:
            'Receba notificações da plataforma e navegue entre a Vitrine Pública e o seu Painel de Utilizador no menu superior.',
          side: 'bottom',
          align: 'end',
        },
      },
    ];
  }

  // Default: UserDashboard ('user-panel')
  return [
    {
      popover: {
        title: `Bem-vindo à Nzila Agro, ${user.name.split(' ')[0]}!`,
        description:
          'Vamos fazer um breve tour pelas funcionalidades principais do seu painel para começar a divulgar produtos e serviços agrícolas em Angola.',
        align: 'center',
      },
    },
    {
      element: '[data-tour="user-profile-card"]',
      popover: {
        title: 'Perfil, Estado da Cota e Uso Ativo',
        description:
          'Consulte o estado da sua conta, validade da cota, bónus acumulados e o contador automático de tempo de uso ativo registado em segundo plano.',
        side: 'right',
        align: 'start',
      },
    },
    {
      element: '[data-tour="user-submission-actions"]',
      popover: {
        title: 'Submeter Produto ou Consultoria',
        description:
          'Clique em «Produto Agrícola» ou «Consultoria/Formação» para publicar rapidamente a sua oferta na vitrine da Nzila Agro.',
        side: 'bottom',
        align: 'center',
      },
    },
    {
      element: '[data-tour="user-analytics-tab"]',
      popover: {
        title: 'Desempenho e Gráficos',
        description:
          'Visualize a evolução mensal do volume de consultas e vendas das suas publicações através de gráficos interativos.',
        side: 'right',
        align: 'center',
      },
    },
    {
      element: '[data-tour="user-profile-tab"]',
      popover: {
        title: 'Autonomia de Dados e Palavra-passe',
        description:
          'Atualize livremente a sua foto de perfil, número de telefone, WhatsApp e palavra-passe sempre que desejar.',
        side: 'right',
        align: 'center',
      },
    },
    {
      element: '[data-tour="user-support-tab"]',
      popover: {
        title: 'Caixa de Suporte Direto',
        description:
          'Envie comprovativos de pagamento de cota ou pedidos de esclarecimento diretamente à equipa administrativa.',
        side: 'right',
        align: 'center',
      },
    },
    {
      element: '[data-tour="nav-notifications"]',
      popover: {
        title: 'Notificações em Tempo Real',
        description:
          'Fique alerta assim que o seu registo for aprovado ou quando qualquer pedido de alteração de senha for processado pelo administrador.',
        side: 'bottom',
        align: 'end',
      },
    },
  ];
}

export const PlatformTour: React.FC<PlatformTourProps> = ({
  user,
  activeView,
  replayRequestId,
  onTourFinished,
}) => {
  const driverRef = useRef<Driver | null>(null);
  const lastReplayIdRef = useRef<number>(0);

  useEffect(() => {
    if (!user) return;
    if (activeView === 'public') return;

    const isManualReplay = replayRequestId > 0 && replayRequestId !== lastReplayIdRef.current;
    const isFirstLogin = !hasCompletedPlatformTour(user.id);

    if (!isFirstLogin && !isManualReplay) {
      return;
    }

    if (isManualReplay) {
      lastReplayIdRef.current = replayRequestId;
    }

    let cancelled = false;
    let pollTimer: number | undefined;
    let attempts = 0;

    const launchTour = () => {
      if (cancelled) return;

      const candidateSteps = buildStepsForView(user, activeView);
      const firstElementStep = candidateSteps.find((s) => typeof s.element === 'string');

      // Wait briefly for async dashboard data to mount its target elements
      if (
        firstElementStep &&
        typeof firstElementStep.element === 'string' &&
        !document.querySelector(firstElementStep.element) &&
        attempts < 25
      ) {
        attempts += 1;
        pollTimer = window.setTimeout(launchTour, 150);
        return;
      }

      // Keep centered welcome step + only target steps currently visible in the DOM
      const availableSteps = candidateSteps.filter((step) => {
        if (!step.element) return true;
        if (typeof step.element === 'string') {
          const el = document.querySelector(step.element) as HTMLElement | null;
          if (!el) return false;
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        }
        return true;
      });

      if (availableSteps.length === 0) return;

      driverRef.current?.destroy();

      const instance = driver({
        showProgress: true,
        animate: true,
        smoothScroll: true,
        allowClose: true,
        overlayColor: '#0F1D14',
        overlayOpacity: 0.62,
        stagePadding: 8,
        stageRadius: 12,
        popoverClass: 'nzila-tour-popover',
        progressText: 'Passo {{current}} de {{total}}',
        nextBtnText: 'Seguinte',
        prevBtnText: 'Anterior',
        doneBtnText: 'Concluir Tour',
        steps: availableSteps,
        onDestroyed: () => {
          markPlatformTourCompleted(user.id);
          driverRef.current = null;
          onTourFinished?.();
        },
      });

      driverRef.current = instance;
      instance.drive();
    };

    // Short initial settle delay so the newly mounted panel finishes layout
    pollTimer = window.setTimeout(launchTour, 280);

    return () => {
      cancelled = true;
      if (pollTimer !== undefined) {
        window.clearTimeout(pollTimer);
      }
      if (driverRef.current) {
        driverRef.current.destroy();
        driverRef.current = null;
      }
    };
  }, [user?.id, user?.role, activeView, replayRequestId, onTourFinished]);

  return null;
};

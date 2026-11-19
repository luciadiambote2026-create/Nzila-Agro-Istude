import ExcelJS from 'exceljs';
import { db, isQuotaCurrentlyActive } from './db.ts';

const BRAND_DARK_GREEN = 'FF14532D';
const BRAND_MED_GREEN = 'FF15803D';
const BRAND_SOFT_GREEN = 'FFEBF4EE';
const ZEBRA_BG = 'FFF7FAF8';
const TOTAL_GOLD_BG = 'FFFEF9C3';
const BORDER_COLOR = 'FFDCE5DE';
const TEXT_DARK = 'FF111814';
const TEXT_MUTED = 'FF546459';
const WHITE = 'FFFFFFFF';

const AOA_FORMAT = '#,##0.00" AOA"';
const INT_FORMAT = '#,##0';

const thinBorder: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: BORDER_COLOR } },
  left: { style: 'thin', color: { argb: BORDER_COLOR } },
  bottom: { style: 'thin', color: { argb: BORDER_COLOR } },
  right: { style: 'thin', color: { argb: BORDER_COLOR } },
};

const totalBorder: Partial<ExcelJS.Borders> = {
  top: { style: 'medium', color: { argb: BRAND_DARK_GREEN } },
  bottom: { style: 'double', color: { argb: BRAND_DARK_GREEN } },
  left: { style: 'thin', color: { argb: BORDER_COLOR } },
  right: { style: 'thin', color: { argb: BORDER_COLOR } },
};

function formatExportTimestamp(): string {
  return new Date().toLocaleString('pt-AO', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

function addSheetTitleBanner(
  sheet: ExcelJS.Worksheet,
  title: string,
  subtitle: string,
  colCount: number
): number {
  const lastColLetter = sheet.getColumn(colCount).letter;

  sheet.mergeCells(`A1:${lastColLetter}1`);
  const titleCell = sheet.getCell('A1');
  titleCell.value = `NZILA AGRO — ${title}`;
  titleCell.font = { name: 'Calibri', size: 14, bold: true, color: { argb: WHITE } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_DARK_GREEN } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  sheet.getRow(1).height = 30;

  sheet.mergeCells(`A2:${lastColLetter}2`);
  const subCell = sheet.getCell('A2');
  subCell.value = `${subtitle}  |  Gerado em: ${formatExportTimestamp()}  |  Moeda base: AOA (Kwanza Angolano)`;
  subCell.font = { name: 'Calibri', size: 10, italic: true, color: { argb: TEXT_MUTED } };
  subCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_SOFT_GREEN } };
  subCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  sheet.getRow(2).height = 22;

  sheet.getRow(3).height = 10;
  return 4;
}

function styleTableHeaderRow(row: ExcelJS.Row, colCount: number): void {
  row.height = 26;
  for (let c = 1; c <= colCount; c++) {
    const cell = row.getCell(c);
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: WHITE } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_MED_GREEN } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = thinBorder;
  }
}

function styleDataRow(row: ExcelJS.Row, colCount: number, isEven: boolean): void {
  row.height = 21;
  for (let c = 1; c <= colCount; c++) {
    const cell = row.getCell(c);
    cell.font = { name: 'Calibri', size: 10, color: { argb: TEXT_DARK } };
    if (isEven) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA_BG } };
    }
    cell.border = thinBorder;
    cell.alignment = { vertical: 'middle', horizontal: cell.alignment?.horizontal || 'left' };
  }
}

function styleTotalRow(row: ExcelJS.Row, colCount: number): void {
  row.height = 25;
  for (let c = 1; c <= colCount; c++) {
    const cell = row.getCell(c);
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: BRAND_DARK_GREEN } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TOTAL_GOLD_BG } };
    cell.border = totalBorder;
    cell.alignment = { vertical: 'middle', horizontal: cell.alignment?.horizontal || 'left' };
  }
}

function applyColumnWidths(sheet: ExcelJS.Worksheet, widths: number[]): void {
  widths.forEach((w, idx) => {
    sheet.getColumn(idx + 1).width = w;
  });
}

export async function buildFinancialReportWorkbook(): Promise<{
  buffer: Buffer;
  summary: {
    salesCount: number;
    donationsCount: number;
    bonusCount: number;
    activeQuotasCount: number;
  };
}> {
  const settings = db
    .prepare('SELECT * FROM financial_settings WHERE id = 1')
    .get() as Record<string, unknown> | undefined;

  const sales = db
    .prepare(
      `SELECT
         s.id,
         s.sale_date,
         s.quantity,
         s.total_kz,
         s.note,
         s.created_at,
         l.title AS listing_title,
         l.category AS listing_category,
         l.province AS listing_province,
         l.unit AS listing_unit,
         u.name AS seller_name,
         u.email AS seller_email
       FROM listing_sales s
       LEFT JOIN listings l ON l.id = s.listing_id
       LEFT JOIN users u ON u.id = s.seller_id
       ORDER BY s.sale_date DESC, s.id DESC`
    )
    .all() as Record<string, unknown>[];

  const donations = db
    .prepare(
      `SELECT id, donor_name, donor_contact, amount, currency, amount_kz, method, reference, message, status, created_at
       FROM donations
       ORDER BY id DESC`
    )
    .all() as Record<string, unknown>[];

  const bonusLogs = db
    .prepare(
      `SELECT b.id, b.amount_kz, b.reason, b.granted_by, b.created_at, u.name AS user_name, u.email AS user_email, u.province AS user_province
       FROM bonus_logs b
       LEFT JOIN users u ON u.id = b.user_id
       ORDER BY b.id DESC`
    )
    .all() as Record<string, unknown>[];

  const users = db
    .prepare(
      `SELECT id, name, email, province, profession, role, status, quota_active, quota_expires_at, bonus_kz, created_at
       FROM users
       ORDER BY id DESC`
    )
    .all() as Record<string, unknown>[];

  const monthlySales = db
    .prepare(
      `SELECT
         substr(sale_date, 1, 7) AS month_key,
         COUNT(*) AS sales_count,
         COALESCE(SUM(quantity), 0) AS total_quantity,
         COALESCE(SUM(total_kz), 0) AS total_kz
       FROM listing_sales
       GROUP BY substr(sale_date, 1, 7)
       ORDER BY month_key DESC`
    )
    .all() as Record<string, unknown>[];

  const quotaValueKz = Number(settings?.quota_value_kz || 5000);
  const activeQuotaUsers = users.filter((u) => isQuotaCurrentlyActive(u));
  const totalSalesKz = sales.reduce((acc, s) => acc + Number(s.total_kz || 0), 0);
  const confirmedDonationsKz = donations
    .filter((d) => String(d.status) === 'Confirmada')
    .reduce((acc, d) => acc + Number(d.amount_kz || 0), 0);
  const pendingDonationsKz = donations
    .filter((d) => String(d.status) === 'Pendente')
    .reduce((acc, d) => acc + Number(d.amount_kz || 0), 0);
  const totalBonusesKz = bonusLogs.reduce((acc, b) => acc + Number(b.amount_kz || 0), 0);
  const estimatedQuotaRevenueKz = activeQuotaUsers.length * quotaValueKz;
  const netOperationalBalanceKz = estimatedQuotaRevenueKz + confirmedDonationsKz - totalBonusesKz;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Nzila Agro';
  workbook.created = new Date();
  workbook.modified = new Date();

  // =========================================================================
  // SHEET 1: RESUMO FINANCEIRO
  // =========================================================================
  const summarySheet = workbook.addWorksheet('Resumo Financeiro', {
    properties: { tabColor: { argb: BRAND_DARK_GREEN } },
  });
  let r = addSheetTitleBanner(
    summarySheet,
    'RELATÓRIO FINANCEIRO E CONTABILÍSTICO',
    'Consolidação de vendas da plataforma, cotas de produtores, doações privadas e bónus atribuídos',
    4
  );

  // KPI Table
  const kpiHeader = summarySheet.getRow(r);
  kpiHeader.values = ['Indicador Financeiro', 'Registos / Base', 'Valor (AOA)', 'Observações Contabilísticas'];
  styleTableHeaderRow(kpiHeader, 4);
  r++;

  const kpiRows: Array<[string, string | number, number, string]> = [
    [
      'Volume Bruto de Vendas (Produtores)',
      `${sales.length} vendas`,
      totalSalesKz,
      'Total transacionado pelos produtores na plataforma',
    ],
    [
      'Receita Estimada de Cotas Ativas',
      `${activeQuotaUsers.length} contas ativas`,
      estimatedQuotaRevenueKz,
      `Base unitária atual: ${quotaValueKz.toLocaleString('pt-PT')} AOA / cota`,
    ],
    [
      'Doações Privadas Confirmadas',
      `${donations.filter((d) => String(d.status) === 'Confirmada').length} confirmadas`,
      confirmedDonationsKz,
      'Receitas de apoio confirmadas pelo Administrador Principal',
    ],
    [
      'Doações Privadas Pendentes',
      `${donations.filter((d) => String(d.status) === 'Pendente').length} pendentes`,
      pendingDonationsKz,
      'Aguardam confirmação bancária / comprovativo',
    ],
    [
      'Total de Bónus Atribuídos (Saídas)',
      `${bonusLogs.length} atribuições`,
      totalBonusesKz,
      'Incentivos financeiros creditados aos produtores',
    ],
  ];

  kpiRows.forEach((item, idx) => {
    const row = summarySheet.getRow(r);
    row.values = item;
    styleDataRow(row, 4, idx % 2 === 1);
    row.getCell(2).alignment = { vertical: 'middle', horizontal: 'center' };
    row.getCell(3).numFmt = AOA_FORMAT;
    row.getCell(3).alignment = { vertical: 'middle', horizontal: 'right' };
    r++;
  });

  const netRow = summarySheet.getRow(r);
  netRow.values = [
    'Saldo Líquido Operacional (Cotas + Doações Confirmadas - Bónus)',
    'Consolidado',
    netOperationalBalanceKz,
    'Não inclui volume bruto direto entre produtor e comprador',
  ];
  styleTotalRow(netRow, 4);
  netRow.getCell(2).alignment = { vertical: 'middle', horizontal: 'center' };
  netRow.getCell(3).numFmt = AOA_FORMAT;
  netRow.getCell(3).alignment = { vertical: 'middle', horizontal: 'right' };
  r += 2;

  // Exchange rates & official coordinates
  const fxHeader = summarySheet.getRow(r);
  fxHeader.values = ['Parâmetro Financeiro Oficial', 'Valor Atual', 'Referência', 'Detalhes'];
  styleTableHeaderRow(fxHeader, 4);
  r++;

  const fxRows: Array<[string, string | number, string, string, string?]> = [
    ['Taxa de Câmbio USD → AOA', Number(settings?.rate_usd_to_kz || 915), '1 USD', 'Câmbio oficial configurado na plataforma', AOA_FORMAT],
    ['Taxa de Câmbio EUR → AOA', Number(settings?.rate_eur_to_kz || 985), '1 EUR', 'Câmbio oficial configurado na plataforma', AOA_FORMAT],
    ['Taxa de Câmbio GBP → AOA', Number(settings?.rate_gbp_to_kz || 1160), '1 GBP', 'Câmbio oficial configurado na plataforma', AOA_FORMAT],
    ['Valor Oficial da Cota', quotaValueKz, 'Mensal / Período', 'Tarifa padrão de subscrição de produtor', AOA_FORMAT],
    ['IBAN Oficial', String(settings?.official_iban || 'N/D'), 'Transferência Bancária', `Titular: ${String(settings?.official_account_holder || 'Nzila Agro')}`],
    ['Multicaixa Express / Conta', String(settings?.official_express || 'N/D'), `Conta: ${String(settings?.official_account_number || 'N/D')}`, `WhatsApp: ${String(settings?.official_whatsapp || 'N/D')}`],
  ];

  fxRows.forEach((item, idx) => {
    const row = summarySheet.getRow(r);
    row.values = [item[0], item[1], item[2], item[3]];
    styleDataRow(row, 4, idx % 2 === 1);
    if (item[4]) {
      row.getCell(2).numFmt = item[4];
      row.getCell(2).alignment = { vertical: 'middle', horizontal: 'right' };
    } else {
      row.getCell(2).alignment = { vertical: 'middle', horizontal: 'left' };
    }
    row.getCell(3).alignment = { vertical: 'middle', horizontal: 'center' };
    r++;
  });

  r += 2;

  // Monthly Sales Breakdown
  const monthlyHeader = summarySheet.getRow(r);
  monthlyHeader.values = ['Mês (AAAA-MM)', 'Nº de Vendas', 'Quantidade Total', 'Receita Total (AOA)'];
  styleTableHeaderRow(monthlyHeader, 4);
  r++;

  const monthlyStartRow = r;
  if (monthlySales.length === 0) {
    const emptyRow = summarySheet.getRow(r);
    emptyRow.values = ['Sem vendas registadas', 0, 0, 0];
    styleDataRow(emptyRow, 4, false);
    emptyRow.getCell(2).numFmt = INT_FORMAT;
    emptyRow.getCell(3).numFmt = INT_FORMAT;
    emptyRow.getCell(4).numFmt = AOA_FORMAT;
    r++;
  } else {
    monthlySales.forEach((m, idx) => {
      const row = summarySheet.getRow(r);
      row.values = [
        String(m.month_key || 'N/D'),
        Number(m.sales_count || 0),
        Number(m.total_quantity || 0),
        Number(m.total_kz || 0),
      ];
      styleDataRow(row, 4, idx % 2 === 1);
      row.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };
      row.getCell(2).numFmt = INT_FORMAT;
      row.getCell(2).alignment = { vertical: 'middle', horizontal: 'right' };
      row.getCell(3).numFmt = '#,##0.##';
      row.getCell(3).alignment = { vertical: 'middle', horizontal: 'right' };
      row.getCell(4).numFmt = AOA_FORMAT;
      row.getCell(4).alignment = { vertical: 'middle', horizontal: 'right' };
      r++;
    });
  }

  const monthlyEndRow = r - 1;
  const monthlyTotalRow = summarySheet.getRow(r);
  monthlyTotalRow.values = [
    'TOTAL ACUMULADO',
    { formula: `SUM(B${monthlyStartRow}:B${monthlyEndRow})` },
    { formula: `SUM(C${monthlyStartRow}:C${monthlyEndRow})` },
    { formula: `SUM(D${monthlyStartRow}:D${monthlyEndRow})` },
  ];
  styleTotalRow(monthlyTotalRow, 4);
  monthlyTotalRow.getCell(2).numFmt = INT_FORMAT;
  monthlyTotalRow.getCell(2).alignment = { vertical: 'middle', horizontal: 'right' };
  monthlyTotalRow.getCell(3).numFmt = '#,##0.##';
  monthlyTotalRow.getCell(3).alignment = { vertical: 'middle', horizontal: 'right' };
  monthlyTotalRow.getCell(4).numFmt = AOA_FORMAT;
  monthlyTotalRow.getCell(4).alignment = { vertical: 'middle', horizontal: 'right' };

  applyColumnWidths(summarySheet, [44, 24, 24, 48]);
  summarySheet.views = [{ state: 'frozen', ySplit: 4 }];

  // =========================================================================
  // SHEET 2: VENDAS REGISTADAS
  // =========================================================================
  const salesSheet = workbook.addWorksheet('Vendas Registadas', {
    properties: { tabColor: { argb: BRAND_MED_GREEN } },
  });
  let sr = addSheetTitleBanner(
    salesSheet,
    'REGISTO DETALHADO DE VENDAS',
    'Histórico completo de vendas declaradas pelos produtores para conferência contabilística',
    10
  );

  const salesHeaderRow = salesSheet.getRow(sr);
  salesHeaderRow.values = [
    'ID',
    'Data da Venda',
    'Produto / Serviço',
    'Categoria',
    'Província',
    'Produtor',
    'Email do Produtor',
    'Quantidade',
    'Valor Total (AOA)',
    'Observações',
  ];
  styleTableHeaderRow(salesHeaderRow, 10);
  const salesHeaderIdx = sr;
  sr++;

  const salesDataStart = sr;
  if (sales.length === 0) {
    const emptyRow = salesSheet.getRow(sr);
    emptyRow.values = ['—', 'Sem registos', '—', '—', '—', '—', '—', 0, 0, 'Nenhuma venda registada até ao momento.'];
    styleDataRow(emptyRow, 10, false);
    emptyRow.getCell(9).numFmt = AOA_FORMAT;
    sr++;
  } else {
    sales.forEach((s, idx) => {
      const row = salesSheet.getRow(sr);
      row.values = [
        Number(s.id),
        String(s.sale_date || ''),
        String(s.listing_title || 'Produto Removido'),
        String(s.listing_category || 'N/D'),
        String(s.listing_province || 'N/D'),
        String(s.seller_name || 'N/D'),
        String(s.seller_email || ''),
        Number(s.quantity || 0),
        Number(s.total_kz || 0),
        String(s.note || ''),
      ];
      styleDataRow(row, 10, idx % 2 === 1);
      row.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };
      row.getCell(2).alignment = { vertical: 'middle', horizontal: 'center' };
      row.getCell(8).numFmt = '#,##0.##';
      row.getCell(8).alignment = { vertical: 'middle', horizontal: 'right' };
      row.getCell(9).numFmt = AOA_FORMAT;
      row.getCell(9).alignment = { vertical: 'middle', horizontal: 'right' };
      sr++;
    });
  }

  const salesDataEnd = sr - 1;
  const salesTotalRow = salesSheet.getRow(sr);
  salesTotalRow.values = [
    '',
    'TOTAL',
    `${sales.length} registos`,
    '',
    '',
    '',
    '',
    { formula: `SUM(H${salesDataStart}:H${salesDataEnd})` },
    { formula: `SUM(I${salesDataStart}:I${salesDataEnd})` },
    '',
  ];
  styleTotalRow(salesTotalRow, 10);
  salesTotalRow.getCell(8).numFmt = '#,##0.##';
  salesTotalRow.getCell(8).alignment = { vertical: 'middle', horizontal: 'right' };
  salesTotalRow.getCell(9).numFmt = AOA_FORMAT;
  salesTotalRow.getCell(9).alignment = { vertical: 'middle', horizontal: 'right' };

  salesSheet.autoFilter = {
    from: { row: salesHeaderIdx, column: 1 },
    to: { row: salesDataEnd, column: 10 },
  };
  applyColumnWidths(salesSheet, [8, 15, 30, 18, 16, 24, 26, 13, 20, 32]);
  salesSheet.views = [{ state: 'frozen', ySplit: salesHeaderIdx }];

  // =========================================================================
  // SHEET 3: DOAÇÕES PRIVADAS
  // =========================================================================
  const donSheet = workbook.addWorksheet('Doações Privadas', {
    properties: { tabColor: { argb: 'FFCA8A04' } },
  });
  let dr = addSheetTitleBanner(
    donSheet,
    'REGISTO DE DOAÇÕES PRIVADAS',
    'Controlo de entradas por doação com conversão cambial oficial para Kwanza (AOA)',
    10
  );

  const donHeaderRow = donSheet.getRow(dr);
  donHeaderRow.values = [
    'ID',
    'Data (UTC)',
    'Doador',
    'Contacto',
    'Valor Original',
    'Moeda',
    'Equivalente (AOA)',
    'Método',
    'Referência',
    'Estado',
  ];
  styleTableHeaderRow(donHeaderRow, 10);
  const donHeaderIdx = dr;
  dr++;

  const donDataStart = dr;
  if (donations.length === 0) {
    const emptyRow = donSheet.getRow(dr);
    emptyRow.values = ['—', 'Sem registos', '—', '—', 0, 'AOA', 0, '—', '—', '—'];
    styleDataRow(emptyRow, 10, false);
    emptyRow.getCell(7).numFmt = AOA_FORMAT;
    dr++;
  } else {
    donations.forEach((d, idx) => {
      const status = String(d.status || 'Pendente');
      const row = donSheet.getRow(dr);
      row.values = [
        Number(d.id),
        String(d.created_at || ''),
        String(d.donor_name || 'Anónimo'),
        String(d.donor_contact || ''),
        Number(d.amount || 0),
        String(d.currency || 'AOA'),
        Number(d.amount_kz || 0),
        String(d.method || ''),
        String(d.reference || ''),
        status,
      ];
      styleDataRow(row, 10, idx % 2 === 1);
      row.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };
      row.getCell(2).alignment = { vertical: 'middle', horizontal: 'center' };
      row.getCell(5).numFmt = '#,##0.00';
      row.getCell(5).alignment = { vertical: 'middle', horizontal: 'right' };
      row.getCell(6).alignment = { vertical: 'middle', horizontal: 'center' };
      row.getCell(7).numFmt = AOA_FORMAT;
      row.getCell(7).alignment = { vertical: 'middle', horizontal: 'right' };
      const statusCell = row.getCell(10);
      statusCell.alignment = { vertical: 'middle', horizontal: 'center' };
      statusCell.font = {
        name: 'Calibri',
        size: 10,
        bold: true,
        color: {
          argb:
            status === 'Confirmada'
              ? 'FF15803D'
              : status === 'Pendente'
                ? 'FFB45309'
                : 'FF64748B',
        },
      };
      dr++;
    });
  }

  const donDataEnd = dr - 1;
  const donTotalRow = donSheet.getRow(dr);
  donTotalRow.values = [
    '',
    'TOTAL',
    `${donations.length} doações`,
    '',
    '',
    '',
    { formula: `SUM(G${donDataStart}:G${donDataEnd})` },
    '',
    '',
    '',
  ];
  styleTotalRow(donTotalRow, 10);
  donTotalRow.getCell(7).numFmt = AOA_FORMAT;
  donTotalRow.getCell(7).alignment = { vertical: 'middle', horizontal: 'right' };

  donSheet.autoFilter = {
    from: { row: donHeaderIdx, column: 1 },
    to: { row: donDataEnd, column: 10 },
  };
  applyColumnWidths(donSheet, [8, 20, 24, 22, 16, 10, 20, 18, 22, 15]);
  donSheet.views = [{ state: 'frozen', ySplit: donHeaderIdx }];

  // =========================================================================
  // SHEET 4: COTAS DE UTILIZADORES
  // =========================================================================
  const quotaSheet = workbook.addWorksheet('Cotas de Utilizadores', {
    properties: { tabColor: { argb: 'FF0F766E' } },
  });
  let qr = addSheetTitleBanner(
    quotaSheet,
    'CONTROLO DE COTAS E SALDOS DE BÓNUS',
    'Situação atual de subscrições (cotas) e saldo acumulado de bónus por utilizador',
    9
  );

  const quotaHeaderRow = quotaSheet.getRow(qr);
  quotaHeaderRow.values = [
    'ID',
    'Nome',
    'Email',
    'Província',
    'Perfil',
    'Estado da Conta',
    'Cota Ativa?',
    'Validade da Cota',
    'Bónus Acumulado (AOA)',
  ];
  styleTableHeaderRow(quotaHeaderRow, 9);
  const quotaHeaderIdx = qr;
  qr++;

  const quotaDataStart = qr;
  if (users.length === 0) {
    const emptyRow = quotaSheet.getRow(qr);
    emptyRow.values = ['—', 'Sem utilizadores', '—', '—', '—', '—', 'Não', '—', 0];
    styleDataRow(emptyRow, 9, false);
    emptyRow.getCell(9).numFmt = AOA_FORMAT;
    qr++;
  } else {
    users.forEach((u, idx) => {
      const active = isQuotaCurrentlyActive(u);
      const row = quotaSheet.getRow(qr);
      row.values = [
        Number(u.id),
        String(u.name || ''),
        String(u.email || ''),
        String(u.province || ''),
        String(u.role || 'USER'),
        String(u.status || ''),
        active ? 'Sim' : 'Não',
        String(u.quota_expires_at || '—'),
        Number(u.bonus_kz || 0),
      ];
      styleDataRow(row, 9, idx % 2 === 1);
      row.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };
      row.getCell(5).alignment = { vertical: 'middle', horizontal: 'center' };
      row.getCell(6).alignment = { vertical: 'middle', horizontal: 'center' };
      const activeCell = row.getCell(7);
      activeCell.alignment = { vertical: 'middle', horizontal: 'center' };
      activeCell.font = {
        name: 'Calibri',
        size: 10,
        bold: true,
        color: { argb: active ? 'FF15803D' : 'FFDC2626' },
      };
      row.getCell(8).alignment = { vertical: 'middle', horizontal: 'center' };
      row.getCell(9).numFmt = AOA_FORMAT;
      row.getCell(9).alignment = { vertical: 'middle', horizontal: 'right' };
      qr++;
    });
  }

  const quotaDataEnd = qr - 1;
  const quotaTotalRow = quotaSheet.getRow(qr);
  quotaTotalRow.values = [
    '',
    'TOTAL',
    `${users.length} contas (${activeQuotaUsers.length} cotas ativas)`,
    '',
    '',
    '',
    '',
    '',
    { formula: `SUM(I${quotaDataStart}:I${quotaDataEnd})` },
  ];
  styleTotalRow(quotaTotalRow, 9);
  quotaTotalRow.getCell(9).numFmt = AOA_FORMAT;
  quotaTotalRow.getCell(9).alignment = { vertical: 'middle', horizontal: 'right' };

  quotaSheet.autoFilter = {
    from: { row: quotaHeaderIdx, column: 1 },
    to: { row: quotaDataEnd, column: 9 },
  };
  applyColumnWidths(quotaSheet, [8, 24, 28, 16, 18, 16, 14, 22, 22]);
  quotaSheet.views = [{ state: 'frozen', ySplit: quotaHeaderIdx }];

  // =========================================================================
  // SHEET 5: HISTÓRICO DE BÓNUS
  // =========================================================================
  const bonusSheet = workbook.addWorksheet('Histórico de Bónus', {
    properties: { tabColor: { argb: 'FF16A34A' } },
  });
  let br = addSheetTitleBanner(
    bonusSheet,
    'HISTÓRICO DE BÓNUS ATRIBUÍDOS',
    'Registo auditável de todos os incentivos financeiros creditados pelo Administrador Principal',
    7
  );

  const bonusHeaderRow = bonusSheet.getRow(br);
  bonusHeaderRow.values = [
    'ID',
    'Data (UTC)',
    'Beneficiário',
    'Email',
    'Província',
    'Valor (AOA)',
    'Motivo / Atribuído Por',
  ];
  styleTableHeaderRow(bonusHeaderRow, 7);
  const bonusHeaderIdx = br;
  br++;

  const bonusDataStart = br;
  if (bonusLogs.length === 0) {
    const emptyRow = bonusSheet.getRow(br);
    emptyRow.values = ['—', 'Sem registos', '—', '—', '—', 0, 'Nenhum bónus atribuído até ao momento.'];
    styleDataRow(emptyRow, 7, false);
    emptyRow.getCell(6).numFmt = AOA_FORMAT;
    br++;
  } else {
    bonusLogs.forEach((b, idx) => {
      const row = bonusSheet.getRow(br);
      row.values = [
        Number(b.id),
        String(b.created_at || ''),
        String(b.user_name || 'N/D'),
        String(b.user_email || ''),
        String(b.user_province || 'N/D'),
        Number(b.amount_kz || 0),
        `${String(b.reason || '')} (por ${String(b.granted_by || 'Admin')})`,
      ];
      styleDataRow(row, 7, idx % 2 === 1);
      row.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };
      row.getCell(2).alignment = { vertical: 'middle', horizontal: 'center' };
      row.getCell(6).numFmt = AOA_FORMAT;
      row.getCell(6).alignment = { vertical: 'middle', horizontal: 'right' };
      br++;
    });
  }

  const bonusDataEnd = br - 1;
  const bonusTotalRow = bonusSheet.getRow(br);
  bonusTotalRow.values = [
    '',
    'TOTAL',
    `${bonusLogs.length} atribuições`,
    '',
    '',
    { formula: `SUM(F${bonusDataStart}:F${bonusDataEnd})` },
    '',
  ];
  styleTotalRow(bonusTotalRow, 7);
  bonusTotalRow.getCell(6).numFmt = AOA_FORMAT;
  bonusTotalRow.getCell(6).alignment = { vertical: 'middle', horizontal: 'right' };

  bonusSheet.autoFilter = {
    from: { row: bonusHeaderIdx, column: 1 },
    to: { row: bonusDataEnd, column: 7 },
  };
  applyColumnWidths(bonusSheet, [8, 20, 24, 28, 16, 20, 42]);
  bonusSheet.views = [{ state: 'frozen', ySplit: bonusHeaderIdx }];

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    summary: {
      salesCount: sales.length,
      donationsCount: donations.length,
      bonusCount: bonusLogs.length,
      activeQuotasCount: activeQuotaUsers.length,
    },
  };
}

export async function buildInventoryReportWorkbook(): Promise<{
  buffer: Buffer;
  summary: {
    listingsCount: number;
    provincesCount: number;
    categoriesCount: number;
  };
}> {
  const listings = db
    .prepare(
      `SELECT
         l.id,
         l.title,
         l.category,
         l.description,
         l.price_kz,
         l.unit,
         l.province,
         l.is_masked,
         l.created_at,
         u.name AS seller_name,
         u.email AS seller_email,
         u.phone AS seller_phone,
         u.whatsapp AS seller_whatsapp,
         u.profession AS seller_profession,
         u.status AS seller_status
       FROM listings l
       LEFT JOIN users u ON u.id = l.user_id
       ORDER BY l.id DESC`
    )
    .all() as Record<string, unknown>[];

  const byProvince = db
    .prepare(
      `SELECT
         province,
         COUNT(*) AS total_listings,
         SUM(CASE WHEN is_masked = 0 THEN 1 ELSE 0 END) AS visible_count,
         SUM(CASE WHEN is_masked = 1 THEN 1 ELSE 0 END) AS masked_count,
         COALESCE(AVG(price_kz), 0) AS avg_price_kz,
         COALESCE(MIN(price_kz), 0) AS min_price_kz,
         COALESCE(MAX(price_kz), 0) AS max_price_kz,
         COALESCE(SUM(price_kz), 0) AS sum_price_kz
       FROM listings
       GROUP BY province
       ORDER BY total_listings DESC, province ASC`
    )
    .all() as Record<string, unknown>[];

  const byCategory = db
    .prepare(
      `SELECT
         category,
         COUNT(*) AS total_listings,
         COALESCE(AVG(price_kz), 0) AS avg_price_kz,
         COALESCE(MIN(price_kz), 0) AS min_price_kz,
         COALESCE(MAX(price_kz), 0) AS max_price_kz,
         COALESCE(SUM(price_kz), 0) AS sum_price_kz
       FROM listings
       GROUP BY category
       ORDER BY total_listings DESC, category ASC`
    )
    .all() as Record<string, unknown>[];

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Nzila Agro';
  workbook.created = new Date();
  workbook.modified = new Date();

  // =========================================================================
  // SHEET 1: INVENTÁRIO DE PRODUTOS
  // =========================================================================
  const invSheet = workbook.addWorksheet('Inventário de Produtos', {
    properties: { tabColor: { argb: BRAND_DARK_GREEN } },
  });
  let ir = addSheetTitleBanner(
    invSheet,
    'INVENTÁRIO OFICIAL DE PRODUTOS E SERVIÇOS',
    'Listagem completa de catálogo com preços em AOA, província, estado de moderação e contactos dos produtores',
    14
  );

  const invHeaderRow = invSheet.getRow(ir);
  invHeaderRow.values = [
    'ID',
    'Produto / Serviço',
    'Categoria',
    'Preço (AOA)',
    'Unidade',
    'Província',
    'Estado da Foto',
    'Produtor',
    'Profissão',
    'Telefone',
    'WhatsApp',
    'Email',
    'Estado da Conta',
    'Publicação (UTC)',
  ];
  styleTableHeaderRow(invHeaderRow, 14);
  const invHeaderIdx = ir;
  ir++;

  const invDataStart = ir;
  if (listings.length === 0) {
    const emptyRow = invSheet.getRow(ir);
    emptyRow.values = ['—', 'Sem produtos publicados', '—', 0, '—', '—', '—', '—', '—', '—', '—', '—', '—', '—'];
    styleDataRow(emptyRow, 14, false);
    emptyRow.getCell(4).numFmt = AOA_FORMAT;
    ir++;
  } else {
    listings.forEach((item, idx) => {
      const isMasked = Number(item.is_masked) === 1;
      const row = invSheet.getRow(ir);
      row.values = [
        Number(item.id),
        String(item.title || ''),
        String(item.category || ''),
        Number(item.price_kz || 0),
        String(item.unit || 'Unidade'),
        String(item.province || ''),
        isMasked ? 'Mascarada' : 'Visível',
        String(item.seller_name || 'N/D'),
        String(item.seller_profession || 'N/D'),
        String(item.seller_phone || ''),
        String(item.seller_whatsapp || ''),
        String(item.seller_email || ''),
        String(item.seller_status || 'N/D'),
        String(item.created_at || ''),
      ];
      styleDataRow(row, 14, idx % 2 === 1);
      row.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };
      row.getCell(4).numFmt = AOA_FORMAT;
      row.getCell(4).alignment = { vertical: 'middle', horizontal: 'right' };
      row.getCell(5).alignment = { vertical: 'middle', horizontal: 'center' };
      const photoCell = row.getCell(7);
      photoCell.alignment = { vertical: 'middle', horizontal: 'center' };
      photoCell.font = {
        name: 'Calibri',
        size: 10,
        bold: true,
        color: { argb: isMasked ? 'FFB45309' : 'FF15803D' },
      };
      row.getCell(13).alignment = { vertical: 'middle', horizontal: 'center' };
      row.getCell(14).alignment = { vertical: 'middle', horizontal: 'center' };
      ir++;
    });
  }

  const invDataEnd = ir - 1;
  const invTotalRow = invSheet.getRow(ir);
  invTotalRow.values = [
    '',
    `TOTAL DO INVENTÁRIO (${listings.length} listagens)`,
    'Valor de Catálogo',
    { formula: `SUM(D${invDataStart}:D${invDataEnd})` },
    '',
    'Preço Médio:',
    { formula: `AVERAGE(D${invDataStart}:D${invDataEnd})` },
    '',
    '',
    '',
    '',
    '',
    '',
    '',
  ];
  styleTotalRow(invTotalRow, 14);
  invTotalRow.getCell(4).numFmt = AOA_FORMAT;
  invTotalRow.getCell(4).alignment = { vertical: 'middle', horizontal: 'right' };
  invTotalRow.getCell(6).alignment = { vertical: 'middle', horizontal: 'right' };
  invTotalRow.getCell(7).numFmt = AOA_FORMAT;
  invTotalRow.getCell(7).alignment = { vertical: 'middle', horizontal: 'right' };

  invSheet.autoFilter = {
    from: { row: invHeaderIdx, column: 1 },
    to: { row: invDataEnd, column: 14 },
  };
  applyColumnWidths(invSheet, [8, 30, 18, 20, 14, 16, 15, 22, 18, 16, 16, 26, 15, 20]);
  invSheet.views = [{ state: 'frozen', ySplit: invHeaderIdx }];

  // =========================================================================
  // SHEET 2: RESUMO POR PROVÍNCIA
  // =========================================================================
  const provSheet = workbook.addWorksheet('Resumo por Província', {
    properties: { tabColor: { argb: BRAND_MED_GREEN } },
  });
  let pr = addSheetTitleBanner(
    provSheet,
    'INVENTÁRIO AGRUPADO POR PROVÍNCIA',
    'Distribuição geográfica das listagens, moderação e faixas de preço em Angola',
    8
  );

  const provHeaderRow = provSheet.getRow(pr);
  provHeaderRow.values = [
    'Província',
    'Total de Listagens',
    'Visíveis',
    'Mascaradas',
    'Preço Médio (AOA)',
    'Preço Mínimo (AOA)',
    'Preço Máximo (AOA)',
    'Soma de Catálogo (AOA)',
  ];
  styleTableHeaderRow(provHeaderRow, 8);
  const provHeaderIdx = pr;
  pr++;

  const provDataStart = pr;
  if (byProvince.length === 0) {
    const emptyRow = provSheet.getRow(pr);
    emptyRow.values = ['Sem dados', 0, 0, 0, 0, 0, 0, 0];
    styleDataRow(emptyRow, 8, false);
    pr++;
  } else {
    byProvince.forEach((p, idx) => {
      const row = provSheet.getRow(pr);
      row.values = [
        String(p.province || 'N/D'),
        Number(p.total_listings || 0),
        Number(p.visible_count || 0),
        Number(p.masked_count || 0),
        Number(p.avg_price_kz || 0),
        Number(p.min_price_kz || 0),
        Number(p.max_price_kz || 0),
        Number(p.sum_price_kz || 0),
      ];
      styleDataRow(row, 8, idx % 2 === 1);
      [2, 3, 4].forEach((col) => {
        row.getCell(col).numFmt = INT_FORMAT;
        row.getCell(col).alignment = { vertical: 'middle', horizontal: 'right' };
      });
      [5, 6, 7, 8].forEach((col) => {
        row.getCell(col).numFmt = AOA_FORMAT;
        row.getCell(col).alignment = { vertical: 'middle', horizontal: 'right' };
      });
      pr++;
    });
  }

  const provDataEnd = pr - 1;
  const provTotalRow = provSheet.getRow(pr);
  provTotalRow.values = [
    'TOTAL NACIONAL',
    { formula: `SUM(B${provDataStart}:B${provDataEnd})` },
    { formula: `SUM(C${provDataStart}:C${provDataEnd})` },
    { formula: `SUM(D${provDataStart}:D${provDataEnd})` },
    { formula: `AVERAGE(E${provDataStart}:E${provDataEnd})` },
    { formula: `MIN(F${provDataStart}:F${provDataEnd})` },
    { formula: `MAX(G${provDataStart}:G${provDataEnd})` },
    { formula: `SUM(H${provDataStart}:H${provDataEnd})` },
  ];
  styleTotalRow(provTotalRow, 8);
  [2, 3, 4].forEach((col) => {
    provTotalRow.getCell(col).numFmt = INT_FORMAT;
    provTotalRow.getCell(col).alignment = { vertical: 'middle', horizontal: 'right' };
  });
  [5, 6, 7, 8].forEach((col) => {
    provTotalRow.getCell(col).numFmt = AOA_FORMAT;
    provTotalRow.getCell(col).alignment = { vertical: 'middle', horizontal: 'right' };
  });

  provSheet.autoFilter = {
    from: { row: provHeaderIdx, column: 1 },
    to: { row: provDataEnd, column: 8 },
  };
  applyColumnWidths(provSheet, [22, 18, 14, 14, 20, 20, 20, 24]);
  provSheet.views = [{ state: 'frozen', ySplit: provHeaderIdx }];

  // =========================================================================
  // SHEET 3: RESUMO POR CATEGORIA
  // =========================================================================
  const catSheet = workbook.addWorksheet('Resumo por Categoria', {
    properties: { tabColor: { argb: 'FFCA8A04' } },
  });
  let cr = addSheetTitleBanner(
    catSheet,
    'INVENTÁRIO AGRUPADO POR CATEGORIA',
    'Análise de volume e preços por categoria agrícola e de serviços',
    6
  );

  const catHeaderRow = catSheet.getRow(cr);
  catHeaderRow.values = [
    'Categoria',
    'Total de Listagens',
    'Preço Médio (AOA)',
    'Preço Mínimo (AOA)',
    'Preço Máximo (AOA)',
    'Soma de Catálogo (AOA)',
  ];
  styleTableHeaderRow(catHeaderRow, 6);
  const catHeaderIdx = cr;
  cr++;

  const catDataStart = cr;
  if (byCategory.length === 0) {
    const emptyRow = catSheet.getRow(cr);
    emptyRow.values = ['Sem dados', 0, 0, 0, 0, 0];
    styleDataRow(emptyRow, 6, false);
    cr++;
  } else {
    byCategory.forEach((c, idx) => {
      const row = catSheet.getRow(cr);
      row.values = [
        String(c.category || 'N/D'),
        Number(c.total_listings || 0),
        Number(c.avg_price_kz || 0),
        Number(c.min_price_kz || 0),
        Number(c.max_price_kz || 0),
        Number(c.sum_price_kz || 0),
      ];
      styleDataRow(row, 6, idx % 2 === 1);
      row.getCell(2).numFmt = INT_FORMAT;
      row.getCell(2).alignment = { vertical: 'middle', horizontal: 'right' };
      [3, 4, 5, 6].forEach((col) => {
        row.getCell(col).numFmt = AOA_FORMAT;
        row.getCell(col).alignment = { vertical: 'middle', horizontal: 'right' };
      });
      cr++;
    });
  }

  const catDataEnd = cr - 1;
  const catTotalRow = catSheet.getRow(cr);
  catTotalRow.values = [
    'TOTAL GERAL',
    { formula: `SUM(B${catDataStart}:B${catDataEnd})` },
    { formula: `AVERAGE(C${catDataStart}:C${catDataEnd})` },
    { formula: `MIN(D${catDataStart}:D${catDataEnd})` },
    { formula: `MAX(E${catDataStart}:E${catDataEnd})` },
    { formula: `SUM(F${catDataStart}:F${catDataEnd})` },
  ];
  styleTotalRow(catTotalRow, 6);
  catTotalRow.getCell(2).numFmt = INT_FORMAT;
  catTotalRow.getCell(2).alignment = { vertical: 'middle', horizontal: 'right' };
  [3, 4, 5, 6].forEach((col) => {
    catTotalRow.getCell(col).numFmt = AOA_FORMAT;
    catTotalRow.getCell(col).alignment = { vertical: 'middle', horizontal: 'right' };
  });

  catSheet.autoFilter = {
    from: { row: catHeaderIdx, column: 1 },
    to: { row: catDataEnd, column: 6 },
  };
  applyColumnWidths(catSheet, [26, 18, 20, 20, 20, 24]);
  catSheet.views = [{ state: 'frozen', ySplit: catHeaderIdx }];

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    summary: {
      listingsCount: listings.length,
      provincesCount: byProvince.length,
      categoriesCount: byCategory.length,
    },
  };
}

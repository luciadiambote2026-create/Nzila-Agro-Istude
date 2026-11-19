import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import { formatCurrency } from './api';
import type { Listing, User } from '../types';

const buildProductQrUrl = (listing: Listing): string => {
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://nzila-agro.ao';
  return `${origin}/?q=${encodeURIComponent(listing.title)}#vitrine`;
};

const drawLabelCard = async (
  doc: jsPDF,
  listing: Listing,
  seller: User,
  x: number,
  y: number,
  w: number,
  h: number
) => {
  const qrUrl = buildProductQrUrl(listing);
  const qrDataUrl = await QRCode.toDataURL(qrUrl, {
    width: 320,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: {
      dark: '#111814',
      light: '#FFFFFF',
    },
  });

  // Outer cut-guide border (dashed light gray)
  doc.setDrawColor(199, 211, 202);
  doc.setLineWidth(0.35);
  doc.setLineDashPattern([2, 2], 0);
  doc.rect(x, y, w, h);
  doc.setLineDashPattern([], 0);

  // Inner label container
  const pad = 4;
  const ix = x + pad;
  const iy = y + pad;
  const iw = w - pad * 2;
  const ih = h - pad * 2;

  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(20, 83, 45);
  doc.setLineWidth(0.5);
  doc.roundedRect(ix, iy, iw, ih, 2.5, 2.5, 'FD');

  // Top dark green brand banner
  const bannerH = 14;
  doc.setFillColor(20, 83, 45); // #14532D
  doc.roundedRect(ix, iy, iw, bannerH, 2.5, 2.5, 'F');
  doc.rect(ix, iy + bannerH - 3, iw, 3, 'F');

  // Yellow accent stripe under banner
  doc.setFillColor(234, 179, 8); // #EAB308
  doc.rect(ix, iy + bannerH, iw, 1.5, 'F');

  // Brand name & ID in banner
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('NZILA AGRO', ix + 5, iy + 8.8);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(254, 240, 138);
  const codeText = `REF #${String(listing.id).padStart(4, '0')}`;
  doc.text(codeText, ix + iw - 5, iy + 8.5, { align: 'right' });

  // Left text column & Right QR column
  const qrSize = 36;
  const qrX = ix + iw - qrSize - 5;
  const qrY = iy + bannerH + 6;
  const textMaxW = iw - qrSize - 14;

  // Category tag
  doc.setTextColor(21, 128, 61);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text(listing.category.toUpperCase(), ix + 5, iy + bannerH + 7);

  // Product Title (up to 2 lines)
  doc.setTextColor(17, 24, 20);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12.5);
  const titleLines = doc.splitTextToSize(listing.title, textMaxW).slice(0, 2);
  doc.text(titleLines, ix + 5, iy + bannerH + 13.5);

  const afterTitleY = iy + bannerH + 13.5 + titleLines.length * 5.2;

  // Price highlight box
  const priceText = `${formatCurrency(listing.priceKz, 'AOA')} / ${listing.unit}`;
  doc.setFillColor(242, 247, 243);
  doc.setDrawColor(220, 229, 222);
  doc.setLineWidth(0.3);
  doc.roundedRect(ix + 5, afterTitleY + 1, textMaxW, 10, 1.5, 1.5, 'FD');

  doc.setTextColor(20, 83, 45);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text(priceText, ix + 8, afterTitleY + 7.5);

  // Origin & Seller metadata
  const metaY = afterTitleY + 16;
  doc.setTextColor(84, 100, 89);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`Origem: ${listing.province}, Angola`, ix + 5, metaY);
  doc.text(`Produtor: ${seller.name}`, ix + 5, metaY + 4.8);
  doc.text(`Contacto: ${seller.whatsapp || seller.phone}`, ix + 5, metaY + 9.6);

  // QR Code box on the right
  doc.setDrawColor(220, 229, 222);
  doc.setLineWidth(0.35);
  doc.roundedRect(qrX - 1.5, qrY - 1.5, qrSize + 3, qrSize + 3, 2, 2, 'S');
  doc.addImage(qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize);

  doc.setTextColor(84, 100, 89);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.text('DIGITALIZE O QR CODE', qrX + qrSize / 2, qrY + qrSize + 4.5, { align: 'center' });

  // Footer strip
  const footerY = iy + ih - 5;
  doc.setDrawColor(237, 242, 238);
  doc.setLineWidth(0.3);
  doc.line(ix + 5, footerY - 4, ix + iw - 5, footerY - 4);

  doc.setTextColor(107, 122, 112);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.text(
    'Etiqueta oficial gerada na plataforma Nzila Agro · Verifique autenticidade e disponibilidade online.',
    ix + 5,
    footerY
  );
};

/**
 * Generates an A4 print-ready PDF containing 4 identical cut-ready labels (2x2 grid)
 * with QR Code for a single product listing.
 */
export async function generateProductLabelPdf(listing: Listing, seller: User): Promise<string> {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth(); // 297mm
  const pageH = doc.internal.pageSize.getHeight(); // 210mm
  const margin = 10;
  const gap = 6;
  const cardW = (pageW - margin * 2 - gap) / 2;
  const cardH = (pageH - margin * 2 - gap) / 2;

  const positions = [
    { x: margin, y: margin },
    { x: margin + cardW + gap, y: margin },
    { x: margin, y: margin + cardH + gap },
    { x: margin + cardW + gap, y: margin + cardH + gap },
  ];

  for (const pos of positions) {
    await drawLabelCard(doc, listing, seller, pos.x, pos.y, cardW, cardH);
  }

  const safeSlug = listing.title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 32);
  const filename = `etiqueta-qr-${safeSlug || listing.id}.pdf`;
  doc.save(filename);
  return filename;
}

/**
 * Generates a multi-page A4 print-ready PDF with QR Code labels for all user listings (4 per page).
 */
export async function generateAllProductLabelsPdf(listings: Listing[], seller: User): Promise<string> {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 10;
  const gap = 6;
  const cardW = (pageW - margin * 2 - gap) / 2;
  const cardH = (pageH - margin * 2 - gap) / 2;

  const positions = [
    { x: margin, y: margin },
    { x: margin + cardW + gap, y: margin },
    { x: margin, y: margin + cardH + gap },
    { x: margin + cardW + gap, y: margin + cardH + gap },
  ];

  for (let i = 0; i < listings.length; i += 1) {
    const slotIndex = i % 4;
    if (i > 0 && slotIndex === 0) {
      doc.addPage('a4', 'landscape');
    }
    const pos = positions[slotIndex];
    await drawLabelCard(doc, listings[i], seller, pos.x, pos.y, cardW, cardH);
  }

  const dateStamp = new Date().toISOString().slice(0, 10);
  const filename = `nzila-agro-etiquetas-produtos-${dateStamp}.pdf`;
  doc.save(filename);
  return filename;
}

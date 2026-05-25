import { BrowserWindow } from 'electron/main';
import type { InvoiceWithItems, ReturnWithItems, PharmacySettings } from '../types/index.js';

// ─── Thermal 80mm invoice HTML ────────────────────────────────────────────────

export function buildThermalInvoiceHTML(
  invoice: InvoiceWithItems,
  settings: Partial<PharmacySettings>,
): string {
  const showBatch = settings.show_batch_on_invoice !== '0';
  const showMrp   = settings.show_mrp_on_invoice   !== '0';
  const currency  = settings.currency_symbol ?? '₹';
  const lang      = settings.language ?? 'en';

  const t = lang === 'ta' ? TA_LABELS : EN_LABELS;

  const itemRows = invoice.items
    .map(item => {
      const batchRow = showBatch
        ? `<tr><td colspan="4" class="small">${t.batch}: ${item.batch_number} | ${t.expiry}: ${item.expiry_date}</td></tr>`
        : '';
      return `
        <tr>
          <td>${item.medicine_name}</td>
          <td class="right">${item.quantity}</td>
          <td class="right">${currency}${item.unit_price.toFixed(2)}</td>
          <td class="right">${currency}${item.total_amount.toFixed(2)}</td>
        </tr>
        ${batchRow}
        <tr>
          <td colspan="4" class="small">${t.gst}: ${item.gst_rate}% | HSN: ${item.hsn_code}</td>
        </tr>
      `;
    })
    .join('');

  const gstBlock = invoice.supply_type === 'intrastate'
    ? `
      <tr><td>${t.cgst}</td><td class="right">${currency}${invoice.cgst_amount.toFixed(2)}</td></tr>
      <tr><td>${t.sgst}</td><td class="right">${currency}${invoice.sgst_amount.toFixed(2)}</td></tr>
    `
    : `<tr><td>${t.igst}</td><td class="right">${currency}${invoice.igst_amount.toFixed(2)}</td></tr>`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: 'Courier New', monospace; font-size: 11px; width: 72mm; }
  .center { text-align: center; }
  .right  { text-align: right; }
  .bold   { font-weight: bold; }
  .small  { font-size: 9px; color: #555; }
  .divider { border-top: 1px dashed #000; margin: 3px 0; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 1px 2px; vertical-align: top; }
  .pharmacy-name { font-size: 14px; font-weight: bold; }
  @media print {
    @page { size: 80mm auto; margin: 2mm; }
    body { width: 76mm; }
  }
</style>
</head>
<body>
  <div class="center">
    <div class="pharmacy-name">${settings.pharmacy_name ?? 'Pharmacy'}</div>
    <div>${settings.pharmacy_address ?? ''}</div>
    <div>${t.phone}: ${settings.pharmacy_phone ?? ''}</div>
    ${settings.pharmacy_gstin ? `<div>GSTIN: ${settings.pharmacy_gstin}</div>` : ''}
    ${settings.pharmacy_dl_number ? `<div>DL: ${settings.pharmacy_dl_number}</div>` : ''}
  </div>

  <div class="divider"></div>

  <table>
    <tr>
      <td class="bold">${t.invoice}: ${invoice.invoice_number}</td>
      <td class="right small">${formatDate(invoice.invoice_date)}</td>
    </tr>
    <tr>
      <td>${t.customer}: ${invoice.customer_name}</td>
      <td class="right">${invoice.payment_method.toUpperCase()}</td>
    </tr>
    ${invoice.customer_gstin ? `<tr><td colspan="2">GSTIN: ${invoice.customer_gstin}</td></tr>` : ''}
    ${invoice.supply_type === 'interstate' ? `<tr><td colspan="2" class="small">Interstate Supply</td></tr>` : ''}
  </table>

  <div class="divider"></div>

  <table>
    <tr class="bold">
      <td>${t.item}</td>
      <td class="right">${t.qty}</td>
      <td class="right">${t.rate}</td>
      <td class="right">${t.amount}</td>
    </tr>
    <tr><td colspan="4"><div class="divider"></div></td></tr>
    ${itemRows}
  </table>

  <div class="divider"></div>

  <table>
    <tr><td>${t.subtotal}</td><td class="right">${currency}${invoice.taxable_amount.toFixed(2)}</td></tr>
    ${gstBlock}
    ${invoice.discount_amount > 0 ? `<tr><td>${t.discount}</td><td class="right">-${currency}${invoice.discount_amount.toFixed(2)}</td></tr>` : ''}
    ${invoice.round_off !== 0 ? `<tr><td>${t.roundOff}</td><td class="right">${currency}${invoice.round_off.toFixed(2)}</td></tr>` : ''}
  </table>

  <div class="divider"></div>

  <table>
    <tr class="bold">
      <td>${t.total}</td>
      <td class="right" style="font-size:13px">${currency}${invoice.total_amount.toFixed(2)}</td>
    </tr>
    ${invoice.paid_amount < invoice.total_amount
      ? `<tr><td>${t.paid}</td><td class="right">${currency}${invoice.paid_amount.toFixed(2)}</td></tr>
         <tr><td>${t.balance}</td><td class="right">${currency}${(invoice.total_amount - invoice.paid_amount).toFixed(2)}</td></tr>`
      : ''}
  </table>

  <div class="divider"></div>

  <div class="center small">
    <div>${t.thankYou}</div>
    <div>${t.poweredBy}</div>
  </div>
</body>
</html>`;
}

// ─── A4 invoice HTML ──────────────────────────────────────────────────────────

export function buildA4InvoiceHTML(
  invoice: InvoiceWithItems,
  settings: Partial<PharmacySettings>,
): string {
  const currency = settings.currency_symbol ?? '₹';
  const lang     = settings.language ?? 'en';
  const t        = lang === 'ta' ? TA_LABELS : EN_LABELS;

  const showBatch = settings.show_batch_on_invoice !== '0';
  const showMrp   = settings.show_mrp_on_invoice   !== '0';

  const gstBlock = invoice.supply_type === 'intrastate'
    ? `<tr><td>CGST</td><td>${currency}${invoice.cgst_amount.toFixed(2)}</td></tr>
       <tr><td>SGST</td><td>${currency}${invoice.sgst_amount.toFixed(2)}</td></tr>`
    : `<tr><td>IGST</td><td>${currency}${invoice.igst_amount.toFixed(2)}</td></tr>`;

  const itemRows = invoice.items.map((item, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>
        ${item.medicine_name}
        ${showBatch ? `<br/><span class="small">Batch: ${item.batch_number} | Exp: ${item.expiry_date}</span>` : ''}
      </td>
      <td>${item.hsn_code}</td>
      <td>${item.quantity} ${item.unit}</td>
      ${showMrp ? `<td class="right">${currency}${item.mrp.toFixed(2)}</td>` : ''}
      <td class="right">${currency}${item.unit_price.toFixed(2)}</td>
      <td class="right">${item.discount_pct > 0 ? item.discount_pct + '%' : '-'}</td>
      <td class="right">${currency}${item.taxable_amount.toFixed(2)}</td>
      <td class="right">${item.gst_rate}%</td>
      <td class="right">${currency}${(item.cgst_amount + item.sgst_amount + item.igst_amount).toFixed(2)}</td>
      <td class="right">${currency}${item.total_amount.toFixed(2)}</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<title>Invoice ${invoice.invoice_number}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: Arial, sans-serif; font-size: 12px; color: #222; padding: 20px; }
  .header { display: flex; justify-content: space-between; margin-bottom: 20px; }
  .pharmacy-name { font-size: 22px; font-weight: bold; color: #1a5276; }
  .invoice-title { font-size: 20px; font-weight: bold; color: #1a5276; text-align: right; }
  .section { margin-bottom: 10px; }
  .section-title { font-weight: bold; border-bottom: 1px solid #ccc; padding-bottom: 3px; margin-bottom: 5px; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #1a5276; color: white; padding: 6px; text-align: left; font-size: 11px; }
  td { padding: 5px 6px; border-bottom: 1px solid #eee; vertical-align: top; }
  .right { text-align: right; }
  .totals-table td { padding: 3px 6px; }
  .total-row { font-weight: bold; font-size: 14px; border-top: 2px solid #1a5276; }
  .small { font-size: 10px; color: #777; }
  .gst-summary { display: flex; gap: 20px; flex-wrap: wrap; margin-top: 10px; }
  .gst-box { border: 1px solid #ccc; padding: 8px 15px; border-radius: 4px; min-width: 120px; }
  .gst-box .label { font-size: 10px; color: #777; }
  .gst-box .value { font-weight: bold; }
  .footer { text-align: center; margin-top: 30px; font-size: 10px; color: #999; }
  @media print {
    @page { size: A4; margin: 15mm; }
    body { padding: 0; }
  }
</style>
</head>
<body>
  <div class="header">
    <div>
      <div class="pharmacy-name">${settings.pharmacy_name ?? 'Pharmacy'}</div>
      <div>${settings.pharmacy_address ?? ''}</div>
      <div>Ph: ${settings.pharmacy_phone ?? ''}</div>
      ${settings.pharmacy_gstin   ? `<div>GSTIN: ${settings.pharmacy_gstin}</div>`     : ''}
      ${settings.pharmacy_dl_number ? `<div>DL No: ${settings.pharmacy_dl_number}</div>` : ''}
    </div>
    <div>
      <div class="invoice-title">TAX INVOICE</div>
      <table class="totals-table" style="width:auto">
        <tr><td>Invoice No:</td><td><strong>${invoice.invoice_number}</strong></td></tr>
        <tr><td>Date:</td><td>${formatDate(invoice.invoice_date)}</td></tr>
        <tr><td>Payment:</td><td>${invoice.payment_method.toUpperCase()}</td></tr>
        <tr><td>Supply Type:</td><td>${invoice.supply_type === 'interstate' ? 'Interstate' : 'Intrastate'}</td></tr>
      </table>
    </div>
  </div>

  <div style="display:flex; gap:20px; margin-bottom:15px;">
    <div class="section" style="flex:1">
      <div class="section-title">Bill To</div>
      <div><strong>${invoice.customer_name}</strong></div>
      ${invoice.customer_gstin ? `<div>GSTIN: ${invoice.customer_gstin}</div>` : ''}
    </div>
    <div class="section" style="flex:1">
      <div class="section-title">Place of Supply</div>
      <div>State Code: ${invoice.customer_state_code ?? '33'}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Item</th>
        <th>HSN</th>
        <th>Qty</th>
        ${showMrp ? '<th class="right">MRP</th>' : ''}
        <th class="right">Rate</th>
        <th class="right">Disc</th>
        <th class="right">Taxable</th>
        <th class="right">GST%</th>
        <th class="right">GST Amt</th>
        <th class="right">Total</th>
      </tr>
    </thead>
    <tbody>${itemRows}</tbody>
  </table>

  <div style="display:flex; justify-content:flex-end; margin-top:10px;">
    <table class="totals-table" style="width:280px">
      <tr><td>Subtotal (Taxable)</td><td class="right">${currency}${invoice.taxable_amount.toFixed(2)}</td></tr>
      ${gstBlock}
      ${invoice.discount_amount > 0 ? `<tr><td>Discount</td><td class="right">-${currency}${invoice.discount_amount.toFixed(2)}</td></tr>` : ''}
      ${invoice.round_off !== 0 ? `<tr><td>Round Off</td><td class="right">${currency}${invoice.round_off.toFixed(2)}</td></tr>` : ''}
      <tr class="total-row">
        <td>TOTAL</td>
        <td class="right">${currency}${invoice.total_amount.toFixed(2)}</td>
      </tr>
      ${invoice.paid_amount < invoice.total_amount
        ? `<tr><td>Paid</td><td class="right">${currency}${invoice.paid_amount.toFixed(2)}</td></tr>
           <tr><td><strong>Balance Due</strong></td><td class="right"><strong>${currency}${(invoice.total_amount - invoice.paid_amount).toFixed(2)}</strong></td></tr>`
        : ''}
    </table>
  </div>

  <div class="gst-summary">
    <div class="gst-box"><div class="label">Taxable Amount</div><div class="value">${currency}${invoice.taxable_amount.toFixed(2)}</div></div>
    ${invoice.supply_type === 'intrastate'
      ? `<div class="gst-box"><div class="label">CGST</div><div class="value">${currency}${invoice.cgst_amount.toFixed(2)}</div></div>
         <div class="gst-box"><div class="label">SGST</div><div class="value">${currency}${invoice.sgst_amount.toFixed(2)}</div></div>`
      : `<div class="gst-box"><div class="label">IGST</div><div class="value">${currency}${invoice.igst_amount.toFixed(2)}</div></div>`}
    <div class="gst-box"><div class="label">Total GST</div><div class="value">${currency}${invoice.total_gst.toFixed(2)}</div></div>
    <div class="gst-box"><div class="label">Grand Total</div><div class="value" style="font-size:16px">${currency}${invoice.total_amount.toFixed(2)}</div></div>
  </div>

  ${invoice.notes ? `<div style="margin-top:10px;"><strong>Notes:</strong> ${invoice.notes}</div>` : ''}

  <div style="margin-top:20px; font-size:10px; color:#555;">
    <strong>Declaration:</strong> I/We hereby certify that the goods/services mentioned in this invoice are in accordance with the actual delivery.
  </div>

  <div class="footer">
    <div>Thank you for your business!</div>
    <div>This is a computer generated invoice — Powered by MediLeader</div>
  </div>
</body>
</html>`;
}

// ─── Credit note HTML ─────────────────────────────────────────────────────────

export function buildCreditNoteHTML(
  ret: ReturnWithItems,
  settings: Partial<PharmacySettings>,
): string {
  const currency = settings.currency_symbol ?? '₹';

  const itemRows = ret.items.map((item, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${item.medicine_name}<br/><span class="small">Batch: ${item.batch_number}</span></td>
      <td>${item.hsn_code}</td>
      <td>${item.quantity}</td>
      <td class="right">${currency}${item.unit_price.toFixed(2)}</td>
      <td class="right">${currency}${item.taxable_amount.toFixed(2)}</td>
      <td class="right">${item.gst_rate}%</td>
      <td class="right">${currency}${item.total_amount.toFixed(2)}</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<title>Credit Note ${ret.return_number}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: Arial, sans-serif; font-size:12px; padding:20px; }
  .title { font-size:20px; font-weight:bold; color:#c0392b; text-align:center; margin-bottom:10px; }
  table { width:100%; border-collapse:collapse; }
  th { background:#c0392b; color:white; padding:6px; font-size:11px; }
  td { padding:5px; border-bottom:1px solid #eee; vertical-align:top; }
  .right { text-align:right; }
  .small { font-size:10px; color:#777; }
  .totals { float:right; width:280px; margin-top:10px; }
  @media print { @page { size: A4; margin:15mm; } body { padding:0; } }
</style>
</head>
<body>
  <div class="title">CREDIT NOTE</div>
  <div style="display:flex; justify-content:space-between; margin-bottom:15px;">
    <div>
      <strong>${settings.pharmacy_name ?? 'Pharmacy'}</strong><br/>
      ${settings.pharmacy_address ?? ''}<br/>
      GSTIN: ${settings.pharmacy_gstin ?? ''}
    </div>
    <div>
      Credit Note No: <strong>${ret.return_number}</strong><br/>
      Date: ${formatDate(ret.return_date)}<br/>
      ${ret.invoice_number ? `Against Invoice: ${ret.invoice_number}` : ''}<br/>
      Type: ${ret.return_type.replace('_', ' ').toUpperCase()}
    </div>
  </div>
  <div><strong>Customer:</strong> ${ret.customer_name}</div>
  <br/>
  <table>
    <thead>
      <tr><th>#</th><th>Item</th><th>HSN</th><th>Qty</th><th class="right">Rate</th><th class="right">Taxable</th><th class="right">GST%</th><th class="right">Total</th></tr>
    </thead>
    <tbody>${itemRows}</tbody>
  </table>
  <div class="totals">
    <table>
      <tr><td>Taxable</td><td class="right">${currency}${ret.taxable_amount.toFixed(2)}</td></tr>
      <tr><td>CGST</td><td class="right">${currency}${ret.cgst_amount.toFixed(2)}</td></tr>
      <tr><td>SGST</td><td class="right">${currency}${ret.sgst_amount.toFixed(2)}</td></tr>
      <tr><td>IGST</td><td class="right">${currency}${ret.igst_amount.toFixed(2)}</td></tr>
      <tr style="font-weight:bold; border-top:2px solid #c0392b;">
        <td>Total Credit</td><td class="right">${currency}${ret.total_amount.toFixed(2)}</td>
      </tr>
    </table>
  </div>
  <div style="clear:both; margin-top:30px; text-align:center; font-size:10px; color:#999;">
    Powered by MediLeader
  </div>
</body>
</html>`;
}

// ─── Print via Electron BrowserWindow ────────────────────────────────────────

export async function printHTML(html: string, silent = false): Promise<void> {
  return new Promise((resolve, reject) => {
    const win = new BrowserWindow({
      show: false,
      webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
    });

    win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

    win.webContents.once('did-finish-load', () => {
      win.webContents.print(
        {
          silent,
          printBackground: true,
          margins: { marginType: 'none' },
        },
        (success, errorType) => {
          win.destroy();
          if (success) resolve();
          else reject(new Error(`Print failed: ${errorType}`));
        }
      );
    });
  });
}

// ─── Labels ───────────────────────────────────────────────────────────────────

const EN_LABELS = {
  invoice: 'Invoice', customer: 'Customer', batch: 'Batch', expiry: 'Exp',
  gst: 'GST', cgst: 'CGST', sgst: 'SGST', igst: 'IGST',
  item: 'Item', qty: 'Qty', rate: 'Rate', amount: 'Amt',
  subtotal: 'Subtotal', discount: 'Discount', roundOff: 'Round Off',
  total: 'TOTAL', paid: 'Paid', balance: 'Balance',
  phone: 'Ph', thankYou: 'Thank you! Visit again.',
  poweredBy: 'Powered by MediLeader',
};

const TA_LABELS = {
  invoice: 'ரசீது', customer: 'வாடிக்கையாளர்', batch: 'தொகுதி', expiry: 'காலாவதி',
  gst: 'ஜிஎஸ்டி', cgst: 'CGST', sgst: 'SGST', igst: 'IGST',
  item: 'பொருள்', qty: 'எண்', rate: 'விலை', amount: 'மொத்தம்',
  subtotal: 'கூட்டுத்தொகை', discount: 'தள்ளுபடி', roundOff: 'கூட்டல்/குறைத்தல்',
  total: 'மொத்தம்', paid: 'செலுத்தியது', balance: 'இருப்பு',
  phone: 'தொ', thankYou: 'நன்றி! மீண்டும் வாருங்கள்.',
  poweredBy: 'MediLeader மூலம் இயக்கப்படுகிறது',
};

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

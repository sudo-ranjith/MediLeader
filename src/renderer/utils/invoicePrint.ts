import { formatCurrency } from './gstCalculator';

export function generateInvoicePDF(invoice: any, items: any[], pharmacyInfo: any) {
  const itemRows = items.map(item => `
    <tr>
      <td style="border:1px solid #ddd;padding:8px">${item.medicine_name}</td>
      <td style="border:1px solid #ddd;padding:8px;text-align:center">${item.batch_number || '-'}</td>
      <td style="border:1px solid #ddd;padding:8px;text-align:center">${item.quantity}</td>
      <td style="border:1px solid #ddd;padding:8px;text-align:right">${formatCurrency(item.unit_price)}</td>
      <td style="border:1px solid #ddd;padding:8px;text-align:center">${item.gst_rate}%</td>
      <td style="border:1px solid #ddd;padding:8px;text-align:right">${formatCurrency(item.item_total)}</td>
    </tr>
  `).join('');

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Invoice ${invoice.invoice_number}</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; color: #333; }
        .header { text-align: center; border-bottom: 2px solid #2563eb; padding-bottom: 15px; margin-bottom: 20px; }
        .pharmacy-name { font-size: 24px; font-weight: bold; color: #1d4ed8; }
        .invoice-info { display: flex; justify-content: space-between; margin-bottom: 20px; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th { background: #2563eb; color: white; padding: 10px; text-align: left; }
        .total-section { margin-left: auto; width: 300px; }
        .total-row { display: flex; justify-content: space-between; padding: 5px 0; }
        .grand-total { font-weight: bold; font-size: 18px; border-top: 2px solid #333; padding-top: 5px; margin-top: 5px; }
        .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #666; }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="pharmacy-name">${pharmacyInfo.pharmacy_name || 'Pharma Vault'}</div>
        <div>${pharmacyInfo.pharmacy_address || ''}</div>
        <div>Phone: ${pharmacyInfo.pharmacy_phone || ''} | GSTIN: ${pharmacyInfo.pharmacy_gstin || ''}</div>
      </div>
      
      <div class="invoice-info">
        <div>
          <strong>Invoice #:</strong> ${invoice.invoice_number}<br>
          <strong>Date:</strong> ${invoice.date}<br>
          <strong>Payment:</strong> ${invoice.payment_method?.toUpperCase() || 'CASH'}
        </div>
        <div>
          ${invoice.customer_name ? `<strong>Customer:</strong> ${invoice.customer_name}` : '<strong>Walk-in Customer</strong>'}
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Medicine</th>
            <th>Batch</th>
            <th>Qty</th>
            <th>Unit Price</th>
            <th>GST%</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>

      <div class="total-section">
        <div class="total-row"><span>Subtotal:</span><span>${formatCurrency(invoice.subtotal)}</span></div>
        <div class="total-row"><span>GST:</span><span>${formatCurrency(invoice.gst_amount)}</span></div>
        ${invoice.discount > 0 ? `<div class="total-row"><span>Discount:</span><span>-${formatCurrency(invoice.discount)}</span></div>` : ''}
        <div class="total-row grand-total"><span>TOTAL:</span><span>${formatCurrency(invoice.total)}</span></div>
      </div>

      <div class="footer">
        <p>Thank you for your purchase! Please keep this invoice for future reference.</p>
        <p>Powered by Pharma Vault</p>
      </div>
    </body>
    </html>
  `;

  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.print();
  }
}

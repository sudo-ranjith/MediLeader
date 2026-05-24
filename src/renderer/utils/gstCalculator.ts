export interface CartItem {
  medicine_id: number;
  medicine_name: string;
  unit_price: number;
  quantity: number;
  gst_rate: number;
  stock_id?: number;
  batch_number?: string;
}

export interface GSTBreakdown {
  [rate: string]: { taxable: number; gst: number };
}

export function calculateGST(items: CartItem[]) {
  const groupedByRate: { [rate: number]: number } = {};

  for (const item of items) {
    const rate = item.gst_rate || 0;
    const taxable = item.unit_price * item.quantity;
    groupedByRate[rate] = (groupedByRate[rate] || 0) + taxable;
  }

  const breakdown: GSTBreakdown = {};
  let subtotal = 0;
  let totalGST = 0;

  for (const item of items) {
    subtotal += item.unit_price * item.quantity;
  }

  for (const [rate, taxable] of Object.entries(groupedByRate)) {
    const gst = taxable * (Number(rate) / 100);
    breakdown[rate] = { taxable, gst };
    totalGST += gst;
  }

  return { breakdown, subtotal, totalGST, total: subtotal + totalGST };
}

export function formatCurrency(amount: number, symbol = '₹'): string {
  return `${symbol}${amount.toFixed(2)}`;
}

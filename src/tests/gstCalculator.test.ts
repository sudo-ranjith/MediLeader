import { describe, it, expect } from 'vitest';
import { calculateGST, formatCurrency } from '../renderer/utils/gstCalculator';

describe('calculateGST', () => {
  it('returns zero totals for empty items', () => {
    const result = calculateGST([]);
    expect(result.subtotal).toBe(0);
    expect(result.totalGST).toBe(0);
    expect(result.total).toBe(0);
    expect(Object.keys(result.breakdown)).toHaveLength(0);
  });

  it('calculates 5% GST correctly', () => {
    const items = [{ medicine_id: 1, medicine_name: 'Test', unit_price: 100, quantity: 2, gst_rate: 5 }];
    const result = calculateGST(items);
    expect(result.subtotal).toBe(200);
    expect(result.totalGST).toBe(10);
    expect(result.total).toBe(210);
    expect(result.breakdown['5'].gst).toBe(10);
  });

  it('calculates 12% GST correctly', () => {
    const items = [{ medicine_id: 1, medicine_name: 'Test', unit_price: 100, quantity: 1, gst_rate: 12 }];
    const result = calculateGST(items);
    expect(result.subtotal).toBe(100);
    expect(result.totalGST).toBe(12);
    expect(result.total).toBe(112);
  });

  it('calculates 18% GST correctly', () => {
    const items = [{ medicine_id: 1, medicine_name: 'Test', unit_price: 100, quantity: 1, gst_rate: 18 }];
    const result = calculateGST(items);
    expect(result.subtotal).toBe(100);
    expect(result.totalGST).toBe(18);
    expect(result.total).toBe(118);
  });

  it('handles 0% GST items', () => {
    const items = [{ medicine_id: 1, medicine_name: 'Test', unit_price: 50, quantity: 3, gst_rate: 0 }];
    const result = calculateGST(items);
    expect(result.subtotal).toBe(150);
    expect(result.totalGST).toBe(0);
    expect(result.total).toBe(150);
  });

  it('handles mixed GST rates', () => {
    const items = [
      { medicine_id: 1, medicine_name: 'A', unit_price: 100, quantity: 1, gst_rate: 5 },
      { medicine_id: 2, medicine_name: 'B', unit_price: 100, quantity: 1, gst_rate: 12 },
      { medicine_id: 3, medicine_name: 'C', unit_price: 100, quantity: 1, gst_rate: 0 },
    ];
    const result = calculateGST(items);
    expect(result.total).toBe(317);
    expect(Object.keys(result.breakdown).length).toBeGreaterThanOrEqual(2);
  });

  it('groups items by GST rate in breakdown', () => {
    const items = [
      { medicine_id: 1, medicine_name: 'A', unit_price: 100, quantity: 1, gst_rate: 5 },
      { medicine_id: 2, medicine_name: 'B', unit_price: 200, quantity: 1, gst_rate: 5 },
    ];
    const result = calculateGST(items);
    expect(result.breakdown['5'].taxable).toBe(300);
    expect(result.breakdown['5'].gst).toBe(15);
    expect(result.totalGST).toBe(15);
  });
});

describe('formatCurrency', () => {
  it('formats with rupee symbol and two decimals', () => {
    expect(formatCurrency(1000)).toBe('₹1000.00');
  });

  it('formats zero correctly', () => {
    expect(formatCurrency(0)).toBe('₹0.00');
  });

  it('formats decimal values', () => {
    expect(formatCurrency(99.5)).toBe('₹99.50');
  });

  it('accepts a custom currency symbol', () => {
    expect(formatCurrency(100, '$')).toBe('$100.00');
  });
});

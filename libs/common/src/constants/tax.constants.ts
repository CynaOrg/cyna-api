/**
 * Single source of truth for the VAT rate applied across the platform.
 *
 * Prices in the database are stored Hors Taxe (HT) — `Subscription.price`,
 * `OrderItem.unitPrice`, `Order.subtotal` — and the TVA is materialized at
 * write time on the `Order.taxAmount`/`Order.total` columns (see
 * `order.service.ts` at order creation). Analytics aggregations multiply
 * by this constant when surfacing TTC totals to the back-office.
 *
 * The matching client constant lives in
 * `cyna-app/src/app/core/constants/tax.constants.ts` — keep them in sync
 * if the rate ever changes.
 */
export const VAT_RATE = 0.2;
export const VAT_MULTIPLIER = 1 + VAT_RATE;

export const toTtc = (ht: number): number => ht * VAT_MULTIPLIER;
export const toHt = (ttc: number): number => ttc / VAT_MULTIPLIER;

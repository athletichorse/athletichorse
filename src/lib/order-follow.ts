/** Follow-up statuses of a website order, in order. */
export const FOLLOW_STATUSES = ["new", "confirmed", "shipped", "delivered", "collected", "returned", "cancelled"] as const;
export type FollowStatus = (typeof FOLLOW_STATUSES)[number];

/** Amount to collect on delivery: nothing when the order was paid online (or voided / refunded). */
export const codAmount = (o: { financial_status: string; total: number | string }) =>
  ["paid", "voided", "refunded"].includes(o.financial_status) ? 0 : Number(o.total);

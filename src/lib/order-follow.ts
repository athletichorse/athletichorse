/** Follow-up statuses of a website order, in order. */
export const FOLLOW_STATUSES = ["new", "confirmed", "shipped", "delivered", "collected", "returned", "cancelled"] as const;
export type FollowStatus = (typeof FOLLOW_STATUSES)[number];

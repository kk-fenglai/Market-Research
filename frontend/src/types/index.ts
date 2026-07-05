export type Plan = 'FREE' | 'STANDARD' | 'AI' | 'AI_UNLIMITED';

export interface TrialStatus {
  enabled: boolean;
  days: number;
  plan: Plan;
  eligible: boolean;
  used: boolean;
  active: boolean;
  daysLeft: number;
  endsAt: string | null;
  usedAt: string | null;
}

export interface TrialPublicConfig {
  enabled: boolean;
  days: number;
  plan: Plan;
}

export interface PaymentsPublicConfig {
  paymentsEnabled: boolean;
  paymentsDisabledMessage?: { zh?: string; en?: string; fr?: string };
}

export type UserRole = 'USER' | 'ADMIN' | 'SUPER_ADMIN';

export interface User {
  id: string;
  email: string;
  name?: string;
  plan: Plan;
  role?: UserRole;
  effectivePlan?: Plan;
  subscriptionEnd?: string | null;
  trial?: TrialStatus;
}

// --- Subscription payments (Stripe / 微信 / 支付宝) ------------------------

export type PayProvider = 'wechat' | 'alipay' | 'stripe';

export type OrderStatus = 'CREATED' | 'PENDING' | 'PAID' | 'CLOSED' | 'REFUNDED' | 'FAILED';

export interface CatalogPrice {
  id: string;
  code: string;
  /** Optional display label (admin-editable). */
  name?: string | null;
  months: number;
  currency: string;
  amountCents: number;
  supportsAutoRenew: boolean;
}

export interface CatalogProduct {
  id: string;
  code: string;
  name: string;
  plan: Exclude<Plan, 'FREE'>;
  prices: CatalogPrice[];
}

export interface PaymentOrderSummary {
  id: string;
  provider: PayProvider;
  product: string;
  plan: Plan;
  months: number;
  currency: string;
  amountCents: number;
  refundedCents: number;
  status: OrderStatus;
  paidAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface CreatedOrderResponse {
  orderId: string;
  provider: PayProvider;
  product: string;
  amountCents: number;
  currency: string;
  codeUrl?: string | null;
  redirectUrl?: string | null;
  expiresAt?: string;
  mock?: boolean;
}

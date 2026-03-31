import axios from 'axios';
import crypto from 'crypto';

const PAYSTACK_BASE = 'https://api.paystack.co';
const headers = () => ({
  Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
  'Content-Type': 'application/json',
});

const PLAN_AMOUNTS: Record<string, number> = {
  basic: 100000,  // ₦1,000 in kobo
  pro: 300000,    // ₦3,000 in kobo
};

const PLAN_CODES: Record<string, string> = {
  basic: process.env.PAYSTACK_PLAN_BASIC || '',
  pro: process.env.PAYSTACK_PLAN_PRO || '',
};

export async function initializeTransaction(
  email: string,
  plan: 'basic' | 'pro',
  userId: string
): Promise<{ authorizationUrl: string; reference: string }> {
  const response = await axios.post(
    `${PAYSTACK_BASE}/transaction/initialize`,
    {
      email,
      amount: PLAN_AMOUNTS[plan],
      plan: PLAN_CODES[plan],
      callback_url: `${process.env.MOBILE_DEEP_LINK}subscription-callback`,
      metadata: { userId, plan },
    },
    { headers: headers() }
  );
  return {
    authorizationUrl: response.data.data.authorization_url,
    reference: response.data.data.reference,
  };
}

export async function verifyTransaction(reference: string): Promise<{
  status: string;
  amount: number;
  customerCode: string;
  subscriptionCode?: string;
  planCode?: string;
  paidAt: string;
  metadata?: any;
}> {
  const response = await axios.get(
    `${PAYSTACK_BASE}/transaction/verify/${reference}`,
    { headers: headers() }
  );
  const data = response.data.data;
  return {
    status: data.status,
    amount: data.amount,
    customerCode: data.customer?.customer_code,
    subscriptionCode: data.subscription?.subscription_code,
    planCode: data.plan?.plan_code,
    paidAt: data.paid_at,
    metadata: data.metadata,
  };
}

export async function disableSubscription(subscriptionCode: string, emailToken: string): Promise<void> {
  await axios.post(
    `${PAYSTACK_BASE}/subscription/disable`,
    { code: subscriptionCode, token: emailToken },
    { headers: headers() }
  );
}

export function validateWebhookSignature(rawBody: string, signature: string): boolean {
  const hash = crypto
    .createHmac('sha512', process.env.PAYSTACK_SECRET_KEY!)
    .update(rawBody)
    .digest('hex');
  return hash === signature;
}

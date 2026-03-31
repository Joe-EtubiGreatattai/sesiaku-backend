import { Request, Response } from 'express';
import Subscription from '../models/Subscription.model';
import User from '../models/User.model';
import { AuthRequest } from '../middleware/auth.middleware';
import {
  initializeTransaction,
  verifyTransaction,
  validateWebhookSignature,
} from '../services/paystack.service';

const PLANS = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    currency: 'NGN',
    features: ['3 manga series', '3 chapters per series', '10 AI copilot uses/month'],
  },
  {
    id: 'basic',
    name: 'Basic',
    price: 1000,
    currency: 'NGN',
    features: ['15 manga series', 'Unlimited chapters', '80 AI copilot uses/month'],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 3000,
    currency: 'NGN',
    features: ['Unlimited manga series', 'Unlimited chapters', '300 AI copilot uses/month', 'Early access badge', 'Priority support'],
  },
];

export function getPlans(_req: Request, res: Response): void {
  res.json({ plans: PLANS });
}

export async function getMySubscription(req: AuthRequest, res: Response): Promise<void> {
  const subscription = await Subscription.findOne({ userId: req.user!._id });
  res.json({ subscription, plan: req.user!.subscriptionTier });
}

export async function initiateSubscription(req: AuthRequest, res: Response): Promise<void> {
  const { plan } = req.body;
  console.log('--- INITIATE SUBSCRIPTION ---');
  console.log(`User: ${req.user?._id} | Email: ${req.user?.email} | Plan: ${plan}`);

  if (!['basic', 'pro'].includes(plan)) {
    res.status(400).json({ error: 'Invalid plan. Choose basic or pro' }); return;
  }

  try {
    const { authorizationUrl, reference } = await initializeTransaction(
      req.user!.email,
      plan,
      String(req.user!._id)
    );
    console.log(`Success: Reference ${reference}`);
    res.json({ authorizationUrl, reference });
  } catch (error: any) {
    console.error('--- INITIATE SUBSCRIPTION ERROR ---');
    console.error(error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Failed to initialize payment', 
      details: error.response?.data?.message || error.message 
    });
  }
}

export async function verifySubscription(req: AuthRequest, res: Response): Promise<void> {
  const reference = String(req.params.reference);
  console.log('--- VERIFY SUBSCRIPTION ---');
  console.log(`User: ${req.user?._id} | Reference: ${reference}`);

  try {
    const data = await verifyTransaction(reference);
    console.log(`Result: ${data.status} | Amount: ${data.amount}`);

    if (data.status !== 'success') {
      res.status(400).json({ error: 'Payment not successful' }); return;
    }

    const plan = (data.amount === 100000 ? 'basic' : 'pro') as 'basic' | 'pro';
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    const subscription = await Subscription.findOneAndUpdate(
      { userId: req.user!._id },
      {
        userId: req.user!._id,
        plan,
        status: 'active',
        paystackCustomerCode: data.customerCode,
        paystackSubscriptionCode: data.subscriptionCode,
        paystackPlanCode: data.planCode,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: false,
        $push: {
          paymentHistory: {
            reference,
            amount: data.amount,
            status: 'success',
            paidAt: new Date(data.paidAt),
          },
        },
      },
      { upsert: true, new: true }
    );

    await User.findByIdAndUpdate(req.user!._id, {
      subscriptionTier: plan,
      subscriptionId: subscription?._id,
    });

    res.json({ subscription, plan });
  } catch (error: any) {
    console.error('--- VERIFY SUBSCRIPTION ERROR ---');
    console.error(error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Failed to verify payment', 
      details: error.response?.data?.message || error.message 
    });
  }
}

export async function cancelSubscription(req: AuthRequest, res: Response): Promise<void> {
  const subscription = await Subscription.findOne({ userId: req.user!._id, status: 'active' });
  if (!subscription) { res.status(404).json({ error: 'No active subscription found' }); return; }
  subscription.cancelAtPeriodEnd = true;
  subscription.cancelledAt = new Date();
  await subscription.save();
  res.json({ message: 'Subscription will cancel at end of billing period', subscription });
}

export async function paystackWebhook(req: Request, res: Response): Promise<void> {
  console.log('--- PAYSTACK WEBHOOK ---');
  const signature = req.headers['x-paystack-signature'] as string;
  const rawBody = JSON.stringify(req.body);

  if (!validateWebhookSignature(rawBody, signature)) {
    console.error('Invalid Paystack Webhook Signature');
    res.status(401).json({ error: 'Invalid signature' }); return;
  }

  try {
    const { event, data } = req.body;
    console.log(`Event: ${event}`);

    if (event === 'charge.success') {
      const userId = data.metadata?.userId;
      const plan = data.metadata?.plan as 'basic' | 'pro';
      if (userId && plan) {
        const periodEnd = new Date();
        periodEnd.setMonth(periodEnd.getMonth() + 1);
        await Subscription.findOneAndUpdate(
          { userId },
          {
            status: 'active',
            currentPeriodEnd: periodEnd,
            $push: { paymentHistory: { reference: data.reference, amount: data.amount, status: 'success', paidAt: new Date(data.paid_at) } },
          }
        );
      }
    } else if (event === 'subscription.disable') {
      const subscriptionCode = data.subscription_code;
      console.log(`Disabling subscription: ${subscriptionCode}`);
      const sub = await Subscription.findOne({ paystackSubscriptionCode: subscriptionCode });
      if (sub) {
        sub.status = 'expired';
        await sub.save();
        await User.findByIdAndUpdate(sub.userId, { subscriptionTier: 'free' });
      }
    }
  } catch (error: any) {
    console.error('--- WEBHOOK ERROR ---');
    console.error(error.message);
  }

  res.sendStatus(200);
}

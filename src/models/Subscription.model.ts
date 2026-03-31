import mongoose, { Document, Schema } from 'mongoose';

export interface ISubscription extends Document {
  userId: mongoose.Types.ObjectId;
  plan: 'free' | 'basic' | 'pro';
  status: 'active' | 'cancelled' | 'expired' | 'pending';
  paystackCustomerCode?: string;
  paystackSubscriptionCode?: string;
  paystackPlanCode?: string;
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
  cancelAtPeriodEnd: boolean;
  cancelledAt?: Date;
  paymentHistory: Array<{
    reference: string;
    amount: number;
    status: string;
    paidAt: Date;
  }>;
}

const SubscriptionSchema = new Schema<ISubscription>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    plan: { type: String, enum: ['free', 'basic', 'pro'], required: true },
    status: { type: String, enum: ['active', 'cancelled', 'expired', 'pending'], default: 'pending' },
    paystackCustomerCode: { type: String },
    paystackSubscriptionCode: { type: String },
    paystackPlanCode: { type: String },
    currentPeriodStart: { type: Date },
    currentPeriodEnd: { type: Date },
    cancelAtPeriodEnd: { type: Boolean, default: false },
    cancelledAt: { type: Date },
    paymentHistory: [
      {
        reference: { type: String },
        amount: { type: Number },
        status: { type: String },
        paidAt: { type: Date },
      },
    ],
  },
  { timestamps: true }
);

export default mongoose.model<ISubscription>('Subscription', SubscriptionSchema);

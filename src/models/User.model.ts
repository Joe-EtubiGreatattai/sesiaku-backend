import mongoose, { Document, Schema } from 'mongoose';
import bcrypt from 'bcryptjs';

export interface IUser extends Document {
  email: string;
  passwordHash?: string;
  googleId?: string;
  username: string;
  displayName: string;
  bio?: string;
  avatarUrl?: string;
  avatarPublicId?: string;
  isEmailVerified: boolean;
  emailVerificationToken?: string;
  emailVerificationExpiry?: Date;
  passwordResetToken?: string;
  passwordResetExpiry?: Date;
  followersCount: number;
  followingCount: number;
  mangaCount: number;
  subscriptionTier: 'free' | 'basic' | 'pro';
  subscriptionId?: mongoose.Types.ObjectId;
  aiUsageThisMonth: number;
  aiUsageResetDate: Date;
  clerkId?: string;
  refreshTokens: string[];
  onboardingCompleted: boolean;
  comparePassword(password: string): Promise<boolean>;
}

const UserSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String },
    googleId: { type: String, sparse: true, unique: true },
    username: { type: String, required: true, unique: true, trim: true, minlength: 3, maxlength: 30 },
    displayName: { type: String, required: true, trim: true, maxlength: 60 },
    bio: { type: String, maxlength: 300 },
    avatarUrl: { type: String },
    avatarPublicId: { type: String },
    isEmailVerified: { type: Boolean, default: false },
    emailVerificationToken: { type: String },
    emailVerificationExpiry: { type: Date },
    passwordResetToken: { type: String },
    passwordResetExpiry: { type: Date },
    followersCount: { type: Number, default: 0 },
    followingCount: { type: Number, default: 0 },
    mangaCount: { type: Number, default: 0 },
    subscriptionTier: { type: String, enum: ['free', 'basic', 'pro'], default: 'free' },
    subscriptionId: { type: Schema.Types.ObjectId, ref: 'Subscription' },
    aiUsageThisMonth: { type: Number, default: 0 },
    aiUsageResetDate: {
      type: Date,
      default: () => {
        const d = new Date();
        d.setMonth(d.getMonth() + 1, 1);
        d.setHours(0, 0, 0, 0);
        return d;
      },
    },
    clerkId: { type: String, unique: true, sparse: true },
    refreshTokens: [{ type: String }],
    onboardingCompleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

UserSchema.methods.comparePassword = async function (password: string): Promise<boolean> {
  if (!this.passwordHash) return false;
  return bcrypt.compare(password, this.passwordHash);
};

// Remove sensitive fields from JSON output
UserSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.passwordHash;
  delete obj.refreshTokens;
  delete obj.emailVerificationToken;
  delete obj.passwordResetToken;
  return obj;
};

export default mongoose.model<IUser>('User', UserSchema);

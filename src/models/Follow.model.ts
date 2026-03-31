import mongoose, { Document, Schema } from 'mongoose';

export interface IFollow extends Document {
  followerId: mongoose.Types.ObjectId;
  followingId: mongoose.Types.ObjectId;
}

const FollowSchema = new Schema<IFollow>(
  {
    followerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    followingId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

FollowSchema.index({ followerId: 1, followingId: 1 }, { unique: true });
FollowSchema.index({ followingId: 1 });

export default mongoose.model<IFollow>('Follow', FollowSchema);

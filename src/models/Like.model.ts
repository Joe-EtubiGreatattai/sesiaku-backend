import mongoose, { Document, Schema } from 'mongoose';

export interface ILike extends Document {
  userId: mongoose.Types.ObjectId;
  mangaId: mongoose.Types.ObjectId;
}

const LikeSchema = new Schema<ILike>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    mangaId: { type: Schema.Types.ObjectId, ref: 'Manga', required: true },
  },
  { timestamps: true }
);

LikeSchema.index({ userId: 1, mangaId: 1 }, { unique: true });
LikeSchema.index({ mangaId: 1 });

export default mongoose.model<ILike>('Like', LikeSchema);

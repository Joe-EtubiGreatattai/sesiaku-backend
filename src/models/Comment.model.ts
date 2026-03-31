import mongoose, { Document, Schema } from 'mongoose';

export interface IComment extends Document {
  mangaId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  parentId?: mongoose.Types.ObjectId;
  text: string;
  likesCount: number;
  dislikesCount: number;
  repliesCount: number;
  isDeleted: boolean;
  deletedAt?: Date;
}

const CommentSchema = new Schema<IComment>(
  {
    mangaId: { type: Schema.Types.ObjectId, ref: 'Manga', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    parentId: { type: Schema.Types.ObjectId, ref: 'Comment', default: null, index: true },
    text: { type: String, required: true, maxlength: 500 },
    likesCount: { type: Number, default: 0 },
    dislikesCount: { type: Number, default: 0 },
    repliesCount: { type: Number, default: 0 },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date },
  },
  { timestamps: true }
);

CommentSchema.index({ mangaId: 1, createdAt: -1 });

export default mongoose.model<IComment>('Comment', CommentSchema);

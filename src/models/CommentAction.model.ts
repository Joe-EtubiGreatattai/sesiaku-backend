import mongoose, { Document, Schema } from 'mongoose';

export enum CommentActionType {
  LIKE = 'like',
  DISLIKE = 'dislike',
}

export interface ICommentAction extends Document {
  userId: mongoose.Types.ObjectId;
  commentId: mongoose.Types.ObjectId;
  type: CommentActionType;
}

const CommentActionSchema = new Schema<ICommentAction>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    commentId: { type: Schema.Types.ObjectId, ref: 'Comment', required: true },
    type: { type: String, enum: Object.values(CommentActionType), required: true },
  },
  { timestamps: true }
);

CommentActionSchema.index({ userId: 1, commentId: 1 }, { unique: true });
CommentActionSchema.index({ commentId: 1, type: 1 });

export default mongoose.model<ICommentAction>('CommentAction', CommentActionSchema);

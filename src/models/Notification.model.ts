import mongoose, { Document, Schema } from 'mongoose';

export enum NotificationType {
  LIKE = 'like',
  COMMENT = 'comment',
  FOLLOW = 'follow',
  SYSTEM = 'system',
  COMMENT_LIKE = 'comment_like',
  COMMENT_DISLIKE = 'comment_dislike',
}

export interface INotification extends Document {
  recipientId: mongoose.Types.ObjectId;
  senderId: mongoose.Types.ObjectId;
  type: NotificationType;
  mangaId?: mongoose.Types.ObjectId;
  commentId?: mongoose.Types.ObjectId;
  text: string;
  isRead: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    recipientId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: Object.values(NotificationType), required: true },
    mangaId: { type: Schema.Types.ObjectId, ref: 'Manga' },
    commentId: { type: Schema.Types.ObjectId, ref: 'Comment' },
    text: { type: String, required: true },
    isRead: { type: Boolean, default: false },
  },
  { timestamps: true }
);

NotificationSchema.index({ recipientId: 1, createdAt: -1 });

export default mongoose.model<INotification>('Notification', NotificationSchema);

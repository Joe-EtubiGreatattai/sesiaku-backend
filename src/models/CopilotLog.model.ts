import mongoose, { Document, Schema } from 'mongoose';

export interface ICopilotLog extends Document {
  userId: mongoose.Types.ObjectId;
  mangaId: mongoose.Types.ObjectId;
  chapterId: mongoose.Types.ObjectId;
  userDirection: string;
  generatedScript: unknown;
  panelsCreated: number;
  tokensUsed: number;
  aiModel: string;
}

const CopilotLogSchema = new Schema<ICopilotLog>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    mangaId: { type: Schema.Types.ObjectId, ref: 'Manga', required: true },
    chapterId: { type: Schema.Types.ObjectId, ref: 'Chapter', required: true },
    userDirection: { type: String, required: true },
    generatedScript: { type: Schema.Types.Mixed },
    panelsCreated: { type: Number, default: 0 },
    tokensUsed: { type: Number, default: 0 },
    aiModel: { type: String, default: 'gpt-4o' },
  },
  { timestamps: true }
);

CopilotLogSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model<ICopilotLog>('CopilotLog', CopilotLogSchema);

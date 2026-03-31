import mongoose, { Document, Schema } from 'mongoose';

export interface IPanel extends Document {
  chapterId: mongoose.Types.ObjectId;
  mangaId: mongoose.Types.ObjectId;
  authorId: mongoose.Types.ObjectId;
  order: number;
  panelType: 'dialog' | 'narration' | 'image-placeholder';
  content: {
    characterName?: string;
    text: string;
    placeholderNote?: string;
  };
  isAiGenerated: boolean;
  copilotLogId?: mongoose.Types.ObjectId;
}

const PanelSchema = new Schema<IPanel>(
  {
    chapterId: { type: Schema.Types.ObjectId, ref: 'Chapter', required: true },
    mangaId: { type: Schema.Types.ObjectId, ref: 'Manga', required: true },
    authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    order: { type: Number, required: true },
    panelType: { type: String, enum: ['dialog', 'narration', 'image-placeholder'], required: true },
    content: {
      characterName: { type: String, maxlength: 60 },
      text: { type: String, required: true, maxlength: 500 },
      placeholderNote: { type: String },
    },
    isAiGenerated: { type: Boolean, default: false },
    copilotLogId: { type: Schema.Types.ObjectId, ref: 'CopilotLog' },
  },
  { timestamps: true }
);

PanelSchema.index({ chapterId: 1, order: 1 });

export default mongoose.model<IPanel>('Panel', PanelSchema);

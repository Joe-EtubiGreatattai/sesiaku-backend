import mongoose, { Document, Schema } from 'mongoose';

export interface IPanel extends Document {
  chapterId: mongoose.Types.ObjectId;
  mangaId: mongoose.Types.ObjectId;
  authorId: mongoose.Types.ObjectId;
  order: number;
  panelType: 'dialog' | 'monologue' | 'narration' | 'action' | 'image-placeholder' | 'image';
  content: {
    characterName?: string;
    text?: string;
    placeholderNote?: string;
    imageUrl?: string;
    imagePublicId?: string;
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
    panelType: { type: String, enum: ['dialog', 'monologue', 'narration', 'action', 'image-placeholder', 'image'], required: true },
    content: {
      characterName: { type: String, maxlength: 60 },
      text: { type: String, maxlength: 500 },
      placeholderNote: { type: String },
      imageUrl: { type: String },
      imagePublicId: { type: String },
    },
    isAiGenerated: { type: Boolean, default: false },
    copilotLogId: { type: Schema.Types.ObjectId, ref: 'CopilotLog' },
  },
  { timestamps: true }
);

PanelSchema.index({ chapterId: 1, order: 1 });

export default mongoose.model<IPanel>('Panel', PanelSchema);

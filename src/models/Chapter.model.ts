import mongoose, { Document, Schema } from 'mongoose';

export interface IChapter extends Document {
  mangaId: mongoose.Types.ObjectId;
  authorId: mongoose.Types.ObjectId;
  title: string;
  chapterNumber: number;
  notes?: string;
  panelCount: number;
  publishStatus: 'draft' | 'published';
  publishedAt?: Date;
  viewsCount: number;
}

const ChapterSchema = new Schema<IChapter>(
  {
    mangaId: { type: Schema.Types.ObjectId, ref: 'Manga', required: true, index: true },
    authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true },
    chapterNumber: { type: Number, required: true },
    notes: { type: String, maxlength: 500 },
    panelCount: { type: Number, default: 0 },
    publishStatus: { type: String, enum: ['draft', 'published'], default: 'draft' },
    publishedAt: { type: Date },
    viewsCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

ChapterSchema.index({ mangaId: 1, chapterNumber: 1 }, { unique: true });
ChapterSchema.index({ mangaId: 1, publishStatus: 1 });

export default mongoose.model<IChapter>('Chapter', ChapterSchema);

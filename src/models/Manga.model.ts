import mongoose, { Document, Schema } from 'mongoose';

export interface IManga extends Document {
  authorId: mongoose.Types.ObjectId;
  title: string;
  description?: string;
  coverUrl?: string;
  coverPublicId?: string;
  genre: string[];
  ageRating: 'all-ages' | 'teen' | 'mature';
  status: 'ongoing' | 'completed' | 'hiatus';
  publishStatus: 'draft' | 'published';
  chapterCount: number;
  publishedChapterCount: number;
  likesCount: number;
  viewsCount: number;
  commentsCount: number;
  tags: string[];
  trendingScore: number;
  publishedAt?: Date;
}

const MangaSchema = new Schema<IManga>(
  {
    authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, maxlength: 1000 },
    coverUrl: { type: String },
    coverPublicId: { type: String },
    genre: [{ type: String }],
    ageRating: { type: String, enum: ['all-ages', 'teen', 'mature'], default: 'all-ages' },
    status: { type: String, enum: ['ongoing', 'completed', 'hiatus'], default: 'ongoing' },
    publishStatus: { type: String, enum: ['draft', 'published'], default: 'draft', index: true },
    chapterCount: { type: Number, default: 0 },
    publishedChapterCount: { type: Number, default: 0 },
    likesCount: { type: Number, default: 0 },
    viewsCount: { type: Number, default: 0 },
    commentsCount: { type: Number, default: 0 },
    tags: [{ type: String }],
    trendingScore: { type: Number, default: 0, index: true },
    publishedAt: { type: Date },
  },
  { timestamps: true }
);

MangaSchema.index({ title: 'text', description: 'text' });
MangaSchema.index({ publishStatus: 1, genre: 1 });

export default mongoose.model<IManga>('Manga', MangaSchema);

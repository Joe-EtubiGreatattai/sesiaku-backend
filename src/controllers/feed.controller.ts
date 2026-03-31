import { Request, Response } from 'express';
import Manga from '../models/Manga.model';
import Follow from '../models/Follow.model';
import { AuthRequest } from '../middleware/auth.middleware';

const GENRES = [
  'Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Horror',
  'Mystery', 'Romance', 'Sci-Fi', 'Slice of Life', 'Sports',
  'Supernatural', 'Thriller', 'Historical', 'Psychological',
];

export async function getTrending(_req: Request, res: Response): Promise<void> {
  const manga = await Manga.find({ publishStatus: 'published' })
    .populate('authorId', 'username displayName avatarUrl')
    .sort({ trendingScore: -1 })
    .limit(20);
  res.json({ manga });
}

export async function getNewReleases(_req: Request, res: Response): Promise<void> {
  const manga = await Manga.find({ publishStatus: 'published' })
    .populate('authorId', 'username displayName avatarUrl')
    .sort({ publishedAt: -1 })
    .limit(20);
  res.json({ manga });
}

export async function getFollowingFeed(req: AuthRequest, res: Response): Promise<void> {
  const page = Number(req.query.page) || 1;
  const limit = 20;
  const follows = await Follow.find({ followerId: req.user!._id }).select('followingId');
  const followingIds = follows.map(f => f.followingId);
  const manga = await Manga.find({ authorId: { $in: followingIds }, publishStatus: 'published' })
    .populate('authorId', 'username displayName avatarUrl')
    .sort({ publishedAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit);
  res.json({ manga, page });
}

export async function getGenres(_req: Request, res: Response): Promise<void> {
  const counts = await Promise.all(
    GENRES.map(async genre => ({
      genre,
      count: await Manga.countDocuments({ publishStatus: 'published', genre }),
    }))
  );
  res.json({ genres: counts });
}

export async function getMangaByGenre(req: Request, res: Response): Promise<void> {
  const page = Number(req.query.page) || 1;
  const limit = 20;
  const { genre } = req.params;
  const manga = await Manga.find({ publishStatus: 'published', genre })
    .populate('authorId', 'username displayName avatarUrl')
    .sort({ trendingScore: -1, publishedAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit);
  const total = await Manga.countDocuments({ publishStatus: 'published', genre });
  res.json({ manga, page, total });
}

export async function search(req: Request, res: Response): Promise<void> {
  const { q, genre, page: pageStr } = req.query;
  const page = Number(pageStr) || 1;
  const limit = 20;

  const query: Record<string, unknown> = { publishStatus: 'published' };
  if (q) query.$text = { $search: String(q) };
  if (genre) query.genre = genre;

  const manga = await Manga.find(query)
    .populate('authorId', 'username displayName avatarUrl')
    .sort(q ? { score: { $meta: 'textScore' } } : { trendingScore: -1 })
    .skip((page - 1) * limit)
    .limit(limit);

  res.json({ manga, page });
}

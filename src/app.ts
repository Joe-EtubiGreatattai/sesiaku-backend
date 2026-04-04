import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import dotenv from 'dotenv';
import { connectDB } from './utils/db';
import http from 'http';
import { initSocket } from './utils/socket';

dotenv.config();

import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import mangaRoutes from './routes/manga.routes';
import aiRoutes from './routes/ai.routes';
import subscriptionRoutes from './routes/subscription.routes';
import feedRoutes from './routes/feed.routes';
import notificationRoutes from './routes/notification.routes';

const app = express();
const server = http.createServer(app);

// Security middleware
app.use(helmet());

app.use(cors({
  origin: (origin, callback) => {
    // During development, allow all origins (even if missing)
    callback(null, true);
  },
  credentials: true,
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Stricter limit for auth routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

// Body parsing
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Root endpoint
app.get('/', (_req, res) => {
  res.send('Welcome to Seisaku API');
});

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', app: 'seisaku-api', version: '1.0.0' });
});

// Routes
app.use('/v1/auth', authLimiter, authRoutes);
app.use('/v1/users', userRoutes);
app.use('/v1/manga', mangaRoutes);
app.use('/v1/ai', aiRoutes);
app.use('/v1/subscriptions', subscriptionRoutes);
app.use('/v1/feed', feedRoutes);
app.use('/v1/notifications', notificationRoutes);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Global error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;

connectDB().then(() => {
  initSocket(server);
  
  server.listen(PORT, () => {
    console.log(`🚀 Seisaku API running on port ${PORT}`);
  });
  
  // High-performance upload timeouts (for slow mobile networks)
  server.keepAliveTimeout = 65000;
  server.headersTimeout = 66000;
});




export default app;

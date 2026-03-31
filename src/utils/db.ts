import mongoose from 'mongoose';

export async function connectDB(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not defined');

  try {
    await mongoose.connect(uri);
    console.log('✅ MongoDB connected');
  } catch (err) {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  }
}

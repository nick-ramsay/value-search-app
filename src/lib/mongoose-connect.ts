import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error("Please define MONGODB_URI in .env");
}

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
  dbName: string | null;
}

declare global {
  var mongoose: MongooseCache | undefined;
}

let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null, dbName: null };
}

export async function connectDB(): Promise<typeof mongoose> {
  const dbName = process.env.MONGODB_DB;
  if (!dbName || dbName.trim() === "") {
    throw new Error(
      'Please define MONGODB_DB in .env (e.g. value-search-py) so user/auth data is stored in the same database as your stock data.'
    );
  }

  if (cached!.conn && cached!.dbName === dbName) {
    return cached!.conn;
  }

  if (cached!.conn && cached!.dbName !== dbName) {
    await mongoose.disconnect();
    cached!.conn = null;
    cached!.promise = null;
    cached!.dbName = null;
  }

  if (!cached!.promise) {
    cached!.dbName = dbName;
    cached!.promise = mongoose.connect(MONGODB_URI!, { dbName });
  }
  cached!.conn = await cached!.promise;
  return cached!.conn;
}

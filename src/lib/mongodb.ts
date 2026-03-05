import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;

if (!uri) {
  throw new Error("Missing MONGODB_URI in environment.");
}

/**
 * Connection options for serverless (e.g. Vercel). If you see
 * "Server selection timed out" on deploy, ensure MongoDB Atlas
 * Network Access allows 0.0.0.0/0 (or your Vercel static IP).
 */
const clientOptions = {
  serverSelectionTimeoutMS: 15000,
  connectTimeoutMS: 15000,
};

let clientPromise: Promise<MongoClient>;

if (process.env.NODE_ENV === "development") {
  const globalWithMongo = global as typeof globalThis & {
    _mongoClientPromise?: Promise<MongoClient>;
  };

  if (!globalWithMongo._mongoClientPromise) {
    const client = new MongoClient(uri, clientOptions);
    globalWithMongo._mongoClientPromise = client.connect();
  }

  clientPromise = globalWithMongo._mongoClientPromise;
} else {
  const client = new MongoClient(uri, clientOptions);
  clientPromise = client.connect();
}

export default clientPromise;

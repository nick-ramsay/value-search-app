import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;

if (!uri) {
  throw new Error("Missing MONGODB_URI in environment.");
}

/**
 * Connection options for serverless (e.g. Vercel). If you see
 * "Server selection timed out" on deploy, ensure MongoDB Atlas
 * Network Access allows 0.0.0.0/0 (or your Vercel static IP).
 *
 * maxPoolSize is capped well below the driver's default of 100: Vercel can
 * run many concurrent serverless instances under load, each with its own
 * MongoClient and connection pool, so a large per-client pool multiplies
 * into far more total connections against Atlas than any single instance
 * actually needs concurrently -- observed in production as intermittent
 * MongoServerSelectionError / TLS alerts carrying the driver's own
 * SystemOverloadedError and ResetPool labels.
 */
const clientOptions = {
  serverSelectionTimeoutMS: 15000,
  connectTimeoutMS: 15000,
  maxPoolSize: 10,
};

// Cached on `global` (not just module scope) in every environment, not only
// development: this survives Next.js's dev-mode HMR module re-evaluation,
// and is a harmless no-op in production, where a serverless instance only
// evaluates this module once per cold start regardless.
const globalWithMongo = global as typeof globalThis & {
  _mongoClientPromise?: Promise<MongoClient>;
};

if (!globalWithMongo._mongoClientPromise) {
  const client = new MongoClient(uri, clientOptions);
  globalWithMongo._mongoClientPromise = client.connect();
}

const clientPromise = globalWithMongo._mongoClientPromise;

export default clientPromise;

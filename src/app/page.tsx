import clientPromise from "@/lib/mongodb";

type ValueRecord = {
  _id: string;
  symbol?: string;
  aiRating?: string;
};

async function getValues(): Promise<ValueRecord[]> {
  const client = await clientPromise;
  const dbName = process.env.MONGODB_DB;
  const aiAssessmentsCollection = process.env.MONGODB_AI_ASSESSMENTS_COLLECTION;

  if (!dbName) {
    throw new Error("Missing MONGODB_URI in environment.");
  }

  if (!aiAssessmentsCollection) {
    throw new Error("Missing MONGODB_AI_ASSESSMENTS_COLLECTION in environment.");
  }

  const db = client.db(dbName);
  const docs = await db.collection(aiAssessmentsCollection).find({}).limit(25).toArray();

  return docs.map((doc) => ({
    _id: doc._id.toString(),
    symbol: typeof doc.symbol === "string" ? doc.symbol : undefined,
    aiRating: typeof doc.aiRating === "string" ? doc.aiRating : undefined,
  }));
}

export default async function Home() {
  const values = await getValues();

  return (
    <div className="min-vh-100 bg-light py-5">
      <main className="container">
        <div className="row justify-content-center">
          <div className="col-lg-8">
            <header className="mb-4">
              <h1 className="h3 mb-2">Value Search</h1>
              <p className="text-muted mb-0">
                Data loaded from the MongoDB collection{" "}
                <code className="px-1 bg-white border rounded">values</code>.
              </p>
            </header>

            <section className="card shadow-sm">
              <div className="card-body">
                {values.length === 0 ? (
                  <p className="text-muted mb-0">
                    No values found. Add documents to get started.
                  </p>
                ) : (
                  <ul className="list-group list-group-flush">
                    {values.map((item) => (
                      <li key={item.symbol} className="list-group-item">
                        <div className="fw-semibold">
                          {
                            item.symbol ? <a href={"https://finviz.com/quote.ashx?t=" + item.symbol.replace(".", "-") + "&ty=l&ta=0&p=w"} target="_blank">{item.symbol}</a> : ""
                          }
                        </div>
                        <div className="text-secondary">
                          {item.aiRating ? <div className="text-secondary">{item.aiRating}</div> : ""}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  )
};
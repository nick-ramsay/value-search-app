This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app) and styled with Bootstrap.

## Getting Started

### MongoDB Setup

Set the following environment variables before running the app:

```bash
export MONGODB_URI="mongodb://localhost:27017"
export MONGODB_DB="value_search"
```

The home page reads from the `values` collection and renders up to 25 documents.

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `src/app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

### MongoDB Atlas and "Server selection timed out"

If you see `MongoServerSelectionError: Server selection timed out after 30000 ms` on Vercel, the app cannot reach your MongoDB Atlas cluster. Vercel runs on dynamic IPs, so Atlas must allow connections from anywhere:

1. In [MongoDB Atlas](https://cloud.mongodb.com/) go to **Network Access**.
2. Click **Add IP Address**.
3. Choose **Allow Access from Anywhere** (adds `0.0.0.0/0`).
4. Confirm.

Use a strong database username and password; access is still protected by credentials. Ensure `MONGODB_URI` and any other required env vars are set in your Vercel project **Settings → Environment Variables**.

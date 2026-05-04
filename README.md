This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app) and styled with Bootstrap.

## Getting Started

### MongoDB Setup

Set the following environment variables before running the app:

```bash
export MONGODB_URI="mongodb://localhost:27017"
export MONGODB_DB="value_search"
```

The home page reads from the `values` collection and renders up to 25 documents.

### Monthly balances (signed-in users)

The **Monthly balances** page (`/monthly-balances`) is protected the same way as **Portfolio**: unauthenticated visitors are redirected to `/login` (with a return URL). After you sign in, open it from the user menu in the navbar.

- **Collections:** `usermonthlybalancesheets` (`UserMonthlyBalanceSheet`) holds accounts and month rows. **`currencyusdexchangerates`** (`CurrencyUsdExchangeRate`) stores **USD per one unit** of each tracked ISO currency (`usdPerUnit`, timestamps). An **AUD** row is created on first use of the FX helpers so the collection is never empty of that starter entry.
- **Behavior:** Each account has an ISO 4217 **currency**; asset balances are stored as positive numbers and debt balances as negative numbers. **Net** is always shown in **USD**: each entered cell is multiplied by that account currency’s `usdPerUnit` and summed (debts stay negative). If a rate is missing for a currency used in a row, Net shows an em dash for that row. While the sheet is loading from the API, a spinner appears in the table area instead of the grid or empty-state copy.
- **Exchange rates:** When a user **creates** an account, that account’s currency is **upserted** into `currencyusdexchangerates` if it was not already present. On **sign-in** (NextAuth `signIn` event) and whenever the monthly-balances API returns sheet data, the server ensures each non-USD currency on the user’s active accounts has a row; if the rate is **missing** or **older than 24 hours**, it **fetches** current USD-based rates from the public [Frankfurter API](https://www.frankfurter.app/) (`api.frankfurter.dev`, ECB data) and updates MongoDB. The GET/PATCH responses include a **`rates`** map (code → `usdPerUnit`) for the client Net calculation.
- **Months vs accounts:** With no saved sheet, or no months and no accounts, the table is empty. You can add months before accounts (month-only rows, no balance columns). When you have at least one account but no month rows, the server adds the **current calendar month** as the first row automatically.
- **Adding months:** The UI supports a single month (`addMonth`) or an inclusive **From / Through** range (`addMonthRange`); months already stored are skipped so nothing is duplicated.
- **Archiving accounts:** Removing an account from the table uses a confirmation modal and sets `archived: true` on that account (balances remain in MongoDB but are omitted from API responses until you **restore** via `restoreAccount`). Creating a new account with the **exact same name** as an archived one returns `409` with `code: "ARCHIVED_ACCOUNT_EXISTS"` and `archivedAccountId`; the UI offers **Restore archived account** instead of duplicating.
- **Editing accounts:** The account info modal lets you change name, asset/debt, account type, and currency. Unsaved changes show a **Save** button; saving uses the `updateAccount` PATCH op (same duplicate-name and archived-name rules as `addAccount`). Switching between asset and debt **re-signs** stored balances for that column so magnitudes stay the same.

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

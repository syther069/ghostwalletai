# GhostWallet Reputation

AI-powered wallet intelligence for the Sui ecosystem.

## Stack

- Next.js 14 App Router
- TypeScript
- TailwindCSS
- shadcn-style UI primitives
- Sui SDK
- OpenAI API with mock fallback

## Local Setup

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:3000`.

## Environment

Copy `.env.example` to `.env.local` and set:

```bash
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
SUI_RPC_URL=https://fullnode.mainnet.sui.io:443
```

If `OPENAI_API_KEY` is missing, the app still fetches real Sui mainnet wallet data and uses the built-in mock AI analysis engine.

## Routes

- `/` wallet analyzer
- `/leaderboard` local browser leaderboard from analyzed wallets
- `/api/analyze` Sui mainnet + AI reputation API

## Deployment Note

This app uses a Next.js API route, so GitHub Pages is not enough for the full-stack MVP. Push this repository to GitHub, then deploy it with a Node-capable Next.js host such as Vercel, Netlify, or a server.

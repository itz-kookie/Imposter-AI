# Imposter

A local-first social deduction word game with Gemini-powered opponents. The browser contains the deterministic game rules; the local Cloudflare Worker keeps the Gemini key private and generates bot clues and votes.

## Requirements

- Node.js 20 or newer
- A Gemini API key

## Run locally

1. Copy `worker/.dev.vars.example` to `worker/.dev.vars`.
2. Add your key:

   ```env
   GEMINI_API_KEY=your_actual_key_here
   ```

3. From the project root, install packages:

   ```bash
   npm install
   ```

4. Start the local Worker in one terminal:

   ```bash
   npm run dev:worker
   ```

5. Start the web app in a second terminal:

   ```bash
   npm run dev:web
   ```

6. Open `http://127.0.0.1:5173`.

The web app proxies `/api` requests to the Worker at `http://localhost:8787`. Your Gemini key is read only by the Worker and is never bundled into browser code.

## Checks

```bash
npm run typecheck
npm run build
```

## Cloudflare later

When you decide to deploy the Worker, add the API key as a secret rather than committing `.dev.vars`:

```bash
cd worker
npx wrangler secret put GEMINI_API_KEY
```

The repository ignores `.dev.vars`, `.env`, build output, Wrangler state, and dependencies.

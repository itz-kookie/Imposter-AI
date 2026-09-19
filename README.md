# Imposter

A local-first social deduction word game with Gemini-powered opponents. The browser contains the deterministic game rules; the local Cloudflare Worker keeps the Gemini key private and generates bot clues and votes.

## Requirements

- Node.js 22 or newer
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

## Deploy to Cloudflare

The web app and the API are deployed together as one Cloudflare Worker: the Worker serves the built
`web/dist` as static assets and handles `/api/*` itself. Deployment runs automatically from GitHub
Actions (`.github/workflows/deploy.yml`) on every push to `main`. Pull requests only typecheck and build.

### One-time setup

1. **Cloudflare API token**: in the Cloudflare dashboard go to My Profile -> API Tokens -> Create Token ->
   **Create Custom Token**. Grant only these permissions and limit Account Resources to your account:

   | Scope   | Permission      | Level |
   | ------- | --------------- | ----- |
   | Account | Workers Scripts | Edit  |
   | User    | User Details    | Read  |
   | User    | Memberships     | Read  |

   No zone permissions are needed when the custom domain is attached in the dashboard. If you instead use
   the `routes` entry in `worker/wrangler.jsonc`, also add Account -> Workers Routes -> Edit and
   Zone -> Zone -> Read for that zone. Copy the token.
2. **Cloudflare Account ID**: shown in the right sidebar of Workers & Pages -> Overview.
3. **Gemini API key**: from Google AI Studio.
4. In the GitHub repository go to Settings -> Secrets and variables -> Actions and add three
   repository secrets:

   | Secret name             | Value                     |
   | ----------------------- | ------------------------- |
   | `CLOUDFLARE_API_TOKEN`  | the token from step 1     |
   | `CLOUDFLARE_ACCOUNT_ID` | the account ID from step 2 |
   | `GEMINI_API_KEY`        | the Gemini key from step 3 |

   The workflow uploads `GEMINI_API_KEY` to the Worker as a secret on each deploy, so it never lives in the repo.

5. Push to `main`. The first run creates the Worker `imposter-game-api` and prints its `workers.dev` URL.

### Custom domain

Attach it in the Cloudflare dashboard: Workers & Pages -> `imposter-game-api` -> Settings ->
Domains & Routes -> Add -> Custom domain. The domain must already be on your Cloudflare account.
Nothing in the repo needs to change; the setting is kept across deploys. If you prefer it in code,
uncomment the `routes` entry in `worker/wrangler.jsonc` and put your hostname there.

### Deploy manually

```bash
npm run build
cd worker
npx wrangler login
npx wrangler secret put GEMINI_API_KEY
npx wrangler deploy
```

The repository ignores `.dev.vars`, `.env`, build output, Wrangler state, and dependencies.

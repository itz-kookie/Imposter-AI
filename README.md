# Imposter

A local-first social deduction word game with AI-powered opponents. The browser contains the deterministic game rules; the Cloudflare Worker keeps the AI API key private and generates bot clues and votes. The AI provider is pluggable: Gemini, Mistral, or any OpenAI-compatible endpoint.

## Requirements

- Node.js 22 or newer
- An API key for one supported AI provider (see [AI providers](#ai-providers))

## Run locally

1. Copy `worker/.dev.vars.example` to `worker/.dev.vars`.
2. Pick a provider and add its key:

   ```env
   AI_PROVIDER=gemini
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

The web app proxies `/api` requests to the Worker at `http://localhost:8787`. Your AI key is read only by the Worker and is never bundled into browser code.

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
3. **AI API key**: for the provider you chose (see [AI providers](#ai-providers)).
4. In the GitHub repository go to Settings -> Secrets and variables -> Actions and add these
   repository secrets:

   | Secret name             | Value                                                         |
   | ----------------------- | ------------------------------------------------------------- |
   | `CLOUDFLARE_API_TOKEN`  | the token from step 1                                         |
   | `CLOUDFLARE_ACCOUNT_ID` | the account ID from step 2                                    |
   | `GEMINI_API_KEY`        | the Gemini key (if using Gemini)                              |
   | `MISTRAL_API_KEY`       | the Mistral key (if using Mistral)                            |
   | `OPENAI_API_KEY`        | the key for an OpenAI-compatible endpoint (if using `openai`) |

   Then under the **Variables** tab add `AI_PROVIDER` with the value `gemini`, `mistral`, or `openai`.
   If it is missing the workflow defaults to `gemini`. For `openai` also add the variables
   `OPENAI_MODEL` and, unless you use OpenAI itself, `OPENAI_BASE_URL`. The workflow uploads only the
   key for the selected provider to the Worker as a secret on each deploy, so it never lives in the repo.

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
npx wrangler secret put GEMINI_API_KEY   # or MISTRAL_API_KEY / OPENAI_API_KEY
npx wrangler deploy --var AI_PROVIDER:gemini
```

The repository ignores `.dev.vars`, `.env`, build output, Wrangler state, and dependencies.

## AI providers

The Worker selects a provider from the `AI_PROVIDER` variable. Set it in `worker/.dev.vars` locally,
in `worker/wrangler.jsonc` under `vars`, or as a GitHub Actions variable for deploys.

| `AI_PROVIDER` | Required                                           | Optional                                       | Notes                                                                                        |
| ------------- | -------------------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `gemini`      | `GEMINI_API_KEY`                                   | `GEMINI_MODEL` (default `gemini-3.5-flash-lite`) | Google AI Studio.                                                                            |
| `mistral`     | `MISTRAL_API_KEY`                                  | `MISTRAL_MODEL` (default `ministral-14b-latest`) | Uses Mistral's OpenAI-compatible endpoint.                                                   |
| `openai`      | `OPENAI_API_KEY`, `OPENAI_MODEL`                   | `OPENAI_BASE_URL` (default `https://api.openai.com/v1`) | Any OpenAI-compatible chat-completions API: Groq, OpenRouter, NVIDIA NIM, OpenAI, and others. |

Only the keys for the selected provider need to exist. `GET /api/health` reports the active provider,
whether it is configured, and the model in use.

### Adding a provider

1. Create `worker/src/providers/<name>.ts` implementing the `AiProvider` interface from `types.ts`.
   It receives a prompt and a JSON schema and must return the parsed object.
2. Add its environment variables to `Env` and one entry to `REGISTRY` in `worker/src/providers/index.ts`.
   Return `null` from the factory when credentials are missing so the health endpoint can report it.
3. Document the variables in `worker/.dev.vars.example` and, if it needs a secret, add it to
   `.github/workflows/deploy.yml`.

Most hosted APIs speak the OpenAI chat-completions format, so before writing a new class check whether
`OpenAICompatibleProvider` with a different `baseUrl` already covers it.

# 💣 Pollen Bomb

**BYOP coding time trial.** You set the fuse. The AI streams code against it.
If the code isn't finished when the fuse hits `00:00.0`, the stream is aborted,
the bomb explodes, and the AI is sent:

> **YOU LOSE. You have died, the bomb has exploded, try faster coding.**

…then its last words stream into the overlay.

## Run it locally

```bash
node server.js        # http://localhost:8080
```

## Connect a wallet (BYOP — Bring Your Own Pollen)

1. The app ships with an App Key (`pk_…`, public by design — safe in client code,
   it can never spend anything by itself).
2. On **enter.pollinations.ai/keys** add the app's **Redirect URI** to that key.
   The exact value is printed in the app under **“how it works / setup”**
   (e.g. `https://<you>.github.io/<repo>/`) — hit *copy*.
3. Click **Connect wallet** → sign in with GitHub → approve **usage**.
   The OAuth authorization-code flow with PKCE (S256) runs and the page comes
   back holding a temporary scoped `sk_` (7 days, revocable from the dashboard).
   **The dashboard only appears after you connect.**

No secrets in the app: the token lives in `sessionStorage` only, never
`localStorage`, never the URL. 🗝️

## How the bomb works

| stage | what happens |
|---|---|
| arm | `POST /v1/chat/completions` with `stream: true` against your chosen text model |
| tick | fuse bar burns down, `AbortController` armed, countdown rendered every 50 ms |
| defused ✅ | stream completes before `0` → `💣 DEFUSED`, time saved to stats |
| exploded 💀 | at `0` we `AbortController.abort()` mid-stream → screen shake, boom SFX |
| last words | partial code + the exact `YOU LOSE…` line are sent back → the dying AI replies |

Model catalog is live from `GET /text/models` (no auth needed).

## Deploy to GitHub Pages

Static site — Pages works out of the box. After the first deploy, register the
Pages URL as the Redirect URI on the App Key (step 2 above) before connecting.

## Endpoints used

- `GET  https://gen.pollinations.ai/text/models` — catalog (no auth)
- `POST https://gen.pollinations.ai/v1/chat/completions` — the run (Bearer)
- `GET  https://gen.pollinations.ai/account/balance` — pollen pill (scope `usage`)
- `GET  https://enter.pollinations.ai/authorize` — OAuth code + PKCE
- `POST https://enter.pollinations.ai/api/oauth/token` — code → temporary `sk_`

MIT. Your pollen, your bomb. 💣

# Rebuffer (HLS network lab): instructions for coding agents

A browser-only lab for HLS video streaming: pick a stream, pick a network (a preset or a bandwidth curve you
draw), press Run, and a real player (hls.js) plays through the simulated network while live charts show its
decisions; a report scores the result. It also inspects HLS playlists. No backend. Sample content: Blender
Studio's _Tears of Steel_ (CC BY 3.0), re-encoded, never cut. Owner: Azamat Jorayev (azamatos). Live at
rebuffer.azamatos.com; sample media at media.azamatos.com. Applies to every agent tool; Claude Code also reads
`CLAUDE.md`.

**Status (2026-10-20): M0 and M1 done, M2 in progress (live charts and saved downloads built; Home setup left).**
Live at https://rebuffer.azamatos.com (every push to `main` deploys; see `techContext.md`, "Deploying"). Start with
`docs/memory-bank/activeContext.md`.

## Read first

1. `docs/memory-bank/activeContext.md`: where things stand, open decisions, the next step.
2. `docs/memory-bank/projectbrief.md`: what this is, why it exists, what success looks like.
3. As the task needs: `productContext.md` (screens, metrics, content and licence rules), `techContext.md`
   (stack, architecture, simulator, player adapters, media, budgets, tests), `progress.md` (milestones).
4. Facts about the owner, domains and default stack: the `me` skill (`~/.claude/skills/me`).

## Commands

| Command                                              | What it does                                                                    |
| ---------------------------------------------------- | ------------------------------------------------------------------------------- |
| `pnpm dev`                                           | Dev server on http://localhost:4002                                             |
| `pnpm typecheck` · `pnpm lint` · `pnpm format:check` | Types, ESLint (strict, type-checked), Prettier                                  |
| `pnpm test`                                          | Vitest: unit tests for `src/core`                                               |
| `pnpm e2e`                                           | Playwright (Chromium, Firefox, WebKit) with axe; builds and serves on port 4012 |
| `pnpm build` · `pnpm size`                           | Production build; bundle budgets (`.size-limit.json`)                           |
| `pnpm media:encode`                                  | Sample streams from _Tears of Steel_ (`scripts/media/README.md`)                |

CI (`.github/workflows/ci.yml`) runs all of these plus Lighthouse CI (`lighthouserc.json`).

## Rules

1. **Write everything fresh.** The owner built video players and Smart TV apps for a client; that code lives
   outside this repo and belongs to the client. Don't copy, port or paraphrase it, and don't use the client's name,
   logo, design, API or assets. The owner's know-how is welcome; their client's code isn't.
2. **The simulation must be honest.** Same setup, same result within the measured margin. Never present a
   simulated number as a real-world measurement. When the visitor's real network is slower than the simulated
   one, the run says so.
3. **The core stays framework-free.** `src/core/` (playlist parser, network simulator, metrics, player adapters)
   imports no React and no UI code, is pure where it can be, and is unit-tested. Live chart data never goes
   through React state.
4. **Keyboard first.** Every feature works with the keyboard alone, including the curve editor; every chart has
   a text alternative. A feature that needs a mouse isn't done.
5. **Only openly licensed content.** The whole _Tears of Steel_, re-encoded but never cut (its soundtrack
   is CC BY-ND), with its CC BY attribution; recorded network traces only under licences that allow it, with their
   attribution; third-party test streams only as labelled links we don't host. Never commercial content or other services' artwork.
6. **No backend, no proxy, no tracking.** A static app; setups and runs live in IndexedDB and `localStorage`.
   Analytics: Cloudflare Web Analytics only.
7. **Media files never go into git.** The scripts that make them do. Test streams for CI are generated with
   ffmpeg in CI.
8. **Tests come with the change:** core code gets unit tests; every screen gets a keyboard-only Playwright test
   and an axe check; bundle and Lighthouse budgets run in CI.
9. **Open decisions stay open until the owner decides.** Propose with a recommendation.
10. **Memory bank:** update `activeContext.md` and `progress.md` at the end of every work session. Absolute
    dates. Mark what isn't built yet as _planned_.
11. **This repo will be public.** No secrets, and nothing personal about the owner beyond these
    projects.

## Working with the owner

- The owner writes in English. Finished work: commit with Conventional Commits.
- Ask first before: creating the GitHub repo or making it public, DNS changes, creating storage buckets, paid
  services, deleting anything in the owner's Cloudflare or GitHub accounts.
- Never ask for tokens in chat; the owner stores secrets (`gh secret set`, `wrangler secret put`).
- Dev port: **4002**.
- Portfolio context (why this project, its deadline) lives in the owner's private notes, which the `me`
  skill points to. Read them; don't copy them here.

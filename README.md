# Korean Learning Lab

A web app for planning, producing, and publishing Korean-learning videos for
YouTube Shorts and long-form YouTube.

The full product workflow is:

```
Topic → AI lesson → Scenes → Assets → Voice → Captions → Preview → Render → YouTube metadata
```

There is no separate script stage: each scene's `narration` field is the spoken
script, written by the scene generator and consumed by the voice stage.

## Project status

**Step 6 — narration generation.** What works today:

- **Per-scene voice generation** with language, voice, speed, pitch and volume
  settings — play, regenerate, and delete each clip. Audio files live under
  `data/audio/`; rows reference them


- **Browser playback of a storyboard** at the real frame size (1080×1920 or
  1920×1080) with scene animations, transitions, a timeline, and transport
  controls — at `/projects/:id/preview`


- **Turning a lesson into a storyboard** — an ordered list of typed, timed
  scenes with on-screen text, narration, visual prompts, animation and
  transitions — then reordering and editing it


- Configuring a lesson: topic, level, video type, target language, content
  style, visual style, and per-cut durations
- **Generating a structured lesson** from that configuration — title, hook,
  learning objective, sections (Korean / romanization / translation /
  explanation / example), and a quiz — then reviewing and editing it before the
  next stage
- Browsing, filtering, viewing, and deleting projects
- A dashboard with live statistics
- A REST API with validation and typed error handling
- A component library, routing, loading states, and error boundaries

**Not implemented yet:** asset generation, caption rendering, final
rendering, and the YouTube API. These stages are
modelled in the data and shown read-only in the project editor so progress is
visible as each one is built.

Without an `AI_API_KEY` the app falls back to a mock generator that returns
clearly-labelled placeholder lessons, so the whole flow works before you have
credentials.

## Requirements

- Node.js 20.9 or newer (developed on Node 25)
- npm 10 or newer

## Getting started

```bash
npm install
```

```bash
cp .env.example .env.local
```

```bash
npm run db:migrate && npm run db:seed
```

```bash
npm run dev
```

Open <http://localhost:3000>.

`db:seed` inserts 24 example projects so the dashboard is not empty; it does
nothing if the database already has data. If you are coming from the old JSON
store, run `npm run db:import` instead — it reads `data/projects.json` and is
safe to run more than once.

### Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server on port 3000 |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript, no emit |
| `npm run db:migrate` | Create and apply a migration from schema changes |
| `npm run db:deploy` | Apply existing migrations (non-interactive) |
| `npm run db:seed` | Insert the sample library (`-- --force` to overwrite) |
| `npm run db:import` | Import a legacy `data/projects.json` (`-- --dry-run` first) |
| `npm run db:studio` | Browse the database |

`npm run typecheck` depends on route types that Next generates during a build.
Run `npm run build` (or `npm run dev`) at least once after cloning.

## Environment variables

All variables are documented in `.env.example`. They are validated at startup by
`src/lib/env.ts`, which fails loudly rather than letting a typo surface later.

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | No | Base URL for absolute links |
| `DATABASE_URL` | No | SQLite file path (default `file:./data/korean-learning-lab.db`) |
| `AI_API_KEY` | No | Anthropic key for lesson generation. Blank falls back to the mock generator |
| `AI_MODEL` | No | Model used for generation (default `claude-opus-5`) |
| `ELEVENLABS_API_KEY` | No | ElevenLabs key. Blank falls back to the mock voice provider |
| `ELEVENLABS_MODEL` | No | Voice model (default `eleven_multilingual_v2`) |
| `YOUTUBE_CLIENT_ID` / `YOUTUBE_CLIENT_SECRET` | No | Reserved for YouTube upload |

The reserved keys are declared so deployment config can be prepared in advance.
Setting one does not enable anything yet. The Settings page shows which are
present — it never exposes their values to the browser.

## Architecture

Next.js App Router with TypeScript and Tailwind CSS. One codebase holds both the
UI and the API, but server logic is isolated under `src/server/` so it can move
into a standalone service later, when video rendering needs a worker process.

### Layers

```
src/app/            Routes, layouts, loading + error boundaries
src/app/api/        HTTP boundary: parses input, maps errors to status codes
src/components/     UI — ui/ primitives, then feature folders
src/server/         Business logic. Never imported by client components.
  services/         Business rules and orchestration
  db/               PrismaClient + driver adapter
  repositories/     Persistence behind an interface
  validation/       Zod schemas, shared by API routes and services
  errors.ts         Typed errors the HTTP layer knows how to translate
src/lib/            Shared utilities, env, API client, display constants
src/types/          Domain and API contracts
```

### Data flow

Two paths, chosen deliberately:

- **Page loads** — server components call the service layer directly
  (`getDashboardData()`, `listProjects()`). No HTTP round trip, no loading
  spinner for first paint, no client-side fetching code to maintain.
- **Mutations and interactive reads** — client components call `src/lib/api-client.ts`,
  which wraps `/api` and throws a typed `ApiClientError` carrying field-level
  validation issues.

Both paths run the same Zod schemas and the same service functions, so a rule
like "Shorts cannot exceed 60 seconds" is enforced once.

### Storage

SQLite via Prisma, with four tables — `Project`, `Lesson`, `Storyboard`, and
`Scene`. Scenes are real rows; a project's pipeline and a lesson's
sections/quiz are JSON columns, because they are always read as a whole and
never queried by their inner fields.

`PrismaProjectRepository` implements the same `ProjectRepository` interface the
JSON store did, so the services above it were untouched by the move. Swapping
to Postgres later is a provider change in `prisma/schema.prisma` plus
regenerated migrations.

```bash
npm run db:migrate   # create + apply a migration
npm run db:seed      # insert the sample library
npm run db:studio    # browse the data
```

### Error handling

| Where | Mechanism |
| --- | --- |
| Service layer | Throws `AppError` subclasses (`NotFoundError`, `ValidationError`, …) |
| API routes | `route()` wrapper catches everything; known errors keep their status, unknown ones become a 500 with no stack leaked |
| API responses | Always `{ ok: true, data }` or `{ ok: false, error: { code, message, issues? } }` |
| Client fetches | `ApiClientError` with `.fieldErrors` ready for form state |
| Page render | `app/error.tsx` per route, `app/global-error.tsx` for root layout failures |
| Missing records | `notFound()` → `app/not-found.tsx` |

### Loading states

`loading.tsx` files stream skeletons matching each page's real layout while
server components resolve. Client mutations use the `loading` prop on `Button`,
which shows a spinner and blocks repeat submissions.

## Routes

| Route | Description |
| --- | --- |
| `/` | Dashboard — statistics, recent, drafts, completed |
| `/create` | Create a new video project |
| `/projects` | Project library, filterable by status and search |
| `/projects/:id` | Project editor — lesson, storyboard, pipeline progress |
| `/projects/:id/preview` | Video preview — playback, timeline, scene properties |
| `/settings` | Configuration and integration status |

Filtering on `/projects` is driven by the URL (`?status=draft&search=particle`),
so filtered views are shareable and the list stays server-rendered.

## API

All responses use the envelope described above.

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/health` | Status and which integrations are configured |
| `GET` | `/api/stats` | Dashboard statistics |
| `GET` | `/api/projects` | List projects. Query: `status`, `format`, `search` |
| `POST` | `/api/projects` | Create a project |
| `GET` | `/api/projects/:id` | Fetch one project |
| `PATCH` | `/api/projects/:id` | Update a project |
| `DELETE` | `/api/projects/:id` | Delete a project |
| `POST` | `/api/lessons/generate` | Generate a lesson without saving it |
| `POST` | `/api/projects/:id/lesson` | Generate from the project's config and save |
| `PUT` | `/api/projects/:id/lesson` | Save an edited lesson |
| `POST` | `/api/projects/:id/scenes` | Build a storyboard from the saved lesson and save |
| `PUT` | `/api/projects/:id/scenes` | Save an edited storyboard |

```bash
curl -X POST localhost:3000/api/projects -H 'Content-Type: application/json' -d '{"topic":"Korean Numbers 1-10","format":"shorts","level":"beginner","targetLanguage":"korean","contentStyle":"vocabulary","visualStyle":"clean_educational","shortsDurationSeconds":30}'
```

`format` accepts `shorts`, `long`, or `both`. Durations are picked from fixed
options — `15/30/60` for Shorts and `180/300/600` for long-form — and a format
must supply a length for every cut it produces, so `both` needs both.

## AI lesson generation

Providers sit behind the `LessonGenerator` interface in
`src/server/ai/lesson-generator.ts`. Two implementations exist: `Anthropic`
(structured outputs via `messages.parse()` and a Zod schema, so the response is
schema-valid rather than parsed out of prose) and `Mock` (no credentials
required). `src/server/ai/index.ts` picks one based on `AI_API_KEY`.

The API key is read only in `src/server/ai/*` and `src/lib/env.ts`, both
server-only. The browser calls `/api/lessons/generate`; it never sees the key.

`src/server/ai/prompt.ts` holds the teaching rules — natural Korean, no
invented forms, strict separation of Korean / romanization / translation, a
level ceiling, and a length budget that differs for Shorts and long-form.
Quality changes belong there, not in the provider.

Generated lessons are stored on the project as `lesson: StoredLesson`, which
records which model produced it and whether a human has edited it since.

```bash
curl -X POST localhost:3000/api/lessons/generate -H 'Content-Type: application/json' -d '{"topic":"Korean Numbers 1-10","level":"beginner","videoType":"shorts","language":"english","style":"vocabulary"}'
```

## Design system

Colours are defined once as CSS custom properties in `src/app/globals.css` and
exposed to Tailwind as tokens (`bg-surface`, `text-foreground-muted`,
`border-border-subtle`, `bg-brand`). Components never hardcode hex values, so
the light and dark palettes both work without touching component code.

Primitives live in `src/components/ui/`: `Button`, `Card`, `Badge`, `Alert`,
`Field` (with `Input`, `Textarea`, `Select`, `RadioCardGroup`), `Progress`,
`Spinner`, `Skeleton`, `EmptyState`, and `ErrorState`.

## What to build next

1. **Replace the JSON store with a real database.** Lessons are now stored on
   every project, so the single JSON file is rewritten in full on each save.
   This is the next thing that breaks.
2. **Script generation** from the saved lesson — the next pipeline stage, and
   the one that turns a lesson into narration with timings.
3. **Background jobs.** Generation already runs long enough to be awkward in a
   request; voice synthesis and rendering will not fit at all. A queue plus
   progress reporting replaces the current in-request approach.
4. **Authentication**, once there is more than one user.

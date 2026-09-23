@AGENTS.md

<!--
  AGENTS.md (imported above) holds the Next.js auto-generated rules block,
  which `next dev` rewrites on every run. Durable project documentation lives
  in this file.
-->

# Korean Learning Lab

## 1. Project Overview

Korean Learning Lab is an AI-powered tool for **creating Korean-learning
videos**. It produces:

- YouTube Shorts
- YouTube long-form Korean-learning videos

This is a **creator / content-production tool**, not a Korean-learning app for
students. The user is a content creator, not a language learner and not a
professional video editor. Optimise the interface for producing videos quickly;
do not add learner-facing features (progress tracking, SRS, streaks).

The intended production pipeline is:

```
topic → lesson → scenes → assets → voice → captions → preview → render → youtube
```

All nine stages exist as data in `PIPELINE_STAGES`. `topic`, `lesson`,
`scenes`, `voice`, and `preview` are implemented.

**There is deliberately no "script" stage.** A scene's `narration` field *is*
the spoken script — the scene generator produces it and the future voice stage
consumes it. Do not reintroduce a separate script stage.

## 2. Current Status

| Step | Name | Status |
|---|---|---|
| 1 | Project setup | **COMPLETE** |
| 2 | Create Video workflow | **COMPLETE** |
| 3 | AI Lesson Generator | **COMPLETE** (see caveat) |
| 4 | Scene Generator | **COMPLETE** (see caveat) |
| 5 | Video Preview | **COMPLETE** |
| 6 | AI Voice | **COMPLETE** (see caveat) |
| 7 | Captions | NOT STARTED |
| 8 | Video Rendering | NOT STARTED |
| 9 | YouTube Metadata | NOT STARTED |
| 10 | Content Library | NOT STARTED |
| 11 | YouTube Publishing | NOT STARTED |
| 12 | Production Readiness | NOT STARTED |

**Steps 3 and 4 caveat — the live AI path has never been executed.** No
`AI_API_KEY` was available during development, so only `MockLessonGenerator`
and `MockSceneGenerator` were exercised end to end. The Anthropic generators
are written against the documented SDK API but have never made a real call.
Model id, structured-output behaviour, real latency, and error mapping are all
unproven. Set `AI_API_KEY` and generate once before relying on them.

**Step 10 note** — `/projects` already provides a project library with status
filtering and search (built in Step 1). Whatever else "Content Library" covers
is undefined and unbuilt.

Steps 9 and 11 have environment variables declared (`YOUTUBE_CLIENT_ID`,
`YOUTUBE_CLIENT_SECRET`) but **no code behind them**. Declaring a variable is
not an implementation.

## 3. Current Architecture

| Concern | Actual implementation |
|---|---|
| Framework | Next.js **16.3.6**, App Router, Turbopack |
| Runtime | React 19.2.8 |
| Language | TypeScript 5, `strict: true`, path alias `@/*` → `src/*` |
| Frontend | React Server Components by default; 10 `"use client"` components |
| Backend | Next.js route handlers under `src/app/api/`, thin HTTP boundary only |
| Database | **SQLite** at `data/korean-learning-lab.db`; generated audio as files under `data/audio/` |
| ORM | **Prisma 7.10.0** with the `better-sqlite3` driver adapter |
| Storage | Tables `Project` / `Lesson` / `Storyboard` / `Scene`, behind the `ProjectRepository` interface |
| AI provider | Anthropic via `@anthropic-ai/sdk` 0.128.0 |
| Voice provider | ElevenLabs via `fetch`, behind `TextToSpeechProvider` |
| UI system | Tailwind CSS v4, CSS-first (`@theme inline`), custom primitives in `src/components/ui/` |
| State management | **No library.** `useState` / `useEffect` + `router.refresh()` |
| Validation | Zod 4.6.5, on every external boundary |
| Testing | **None.** No test files, no test runner, no test script |
| Script runner | `tsx` (dev-only), for `scripts/*.ts` |

### Two data paths (important)

- **Server components read through the service layer directly** —
  `getDashboardData()`, `listProjects()`, `getProject()`. No HTTP hop.
- **Client components mutate through `src/lib/api-client.ts`**, which calls
  `/api` and throws a typed `ApiClientError` carrying field-level issues.

Never fetch `/api` from a server component. Both paths run the same Zod schemas
and the same services, so a rule is enforced once.

### Layering

```
src/app/         routes + route handlers (parse, delegate, map errors)
src/components/  ui/ primitives → feature folders
src/lib/         env, api-client, constants, utils (shared, client-safe except env)
src/server/      ai/ · services/ · repositories/ · validation/ · errors · http
src/types/       domain + API contracts
```

`src/server/**` is server-only. Business rules live in `src/server/services/`,
not in route handlers and not in components. Repositories are dumb persistence.

## 4. Current Directory Structure

```
src/
├── app/
│   ├── api/
│   │   ├── health/route.ts
│   │   ├── stats/route.ts
│   │   ├── lessons/generate/route.ts
│   │   └── projects/
│   │       ├── route.ts
│   │       └── [id]/
│   │           ├── route.ts
│   │           ├── lesson/route.ts
│   │           └── scenes/route.ts
│   ├── page.tsx                 dashboard (force-dynamic)
│   ├── create/page.tsx
│   ├── projects/page.tsx, [id]/page.tsx
│   ├── settings/page.tsx        (force-dynamic)
│   ├── layout.tsx, globals.css  design tokens live here
│   └── loading/error/global-error/not-found.tsx
│
├── components/
│   ├── ui/        button, card, badge, alert, field, progress,
│   │              spinner, skeleton, empty-state, error-state
│   ├── layout/    app-shell, sidebar-nav, page-header
│   ├── create/    create-workflow, create-project-form, generation-progress
│   ├── lesson/    lesson-panel, lesson-view, lesson-editor
│   ├── scenes/    scene-panel, scene-card
│   ├── voice/     voice-settings-panel, scene-audio-controls
│   ├── preview/   preview-workspace, scene-stage, playback-controls,
│   │              preview-timeline, scene-properties, use-scene-playback
│   ├── projects/  project-card, project-grid, project-filters,
│   │              pipeline-list, delete-project-button
│   └── dashboard/ stats-grid, project-section
│
├── lib/
│   ├── env.ts         Zod-validated server env — SECRETS, server-only
│   ├── api-client.ts  typed client for /api
│   ├── constants.ts   display metadata for every enum + STAGE_META
│   ├── preview.ts     frame sizes, animation/transition class maps
│   └── utils/         cn, format, project
│
├── server/
│   ├── ai/
│   │   ├── lesson-generator.ts          the LessonGenerator interface
│   │   ├── anthropic-lesson-generator.ts
│   │   ├── mock-lesson-generator.ts
│   │   ├── lesson-schema.ts             output + edit schemas
│   │   ├── prompt.ts                    ALL teaching rules live here
│   │   ├── scene-generator.ts           the SceneGenerator interface
│   │   ├── anthropic-scene-generator.ts
│   │   ├── mock-scene-generator.ts
│   │   ├── scene-schema.ts              output + edit schemas
│   │   ├── scene-prompt.ts              ALL storyboard rules live here
│   │   ├── anthropic-errors.ts          shared SDK error mapping
│   │   └── index.ts                     provider selection
│   ├── tts/           text-to-speech-provider.ts (interface),
│   │                  elevenlabs-provider.ts, mock-provider.ts,
│   │                  audio-storage.ts, index.ts (provider selection)
│   ├── services/      project-service.ts, lesson-service.ts,
│   │                  scene-service.ts, voice-service.ts
│   ├── db/            client.ts (PrismaClient + driver adapter)
│   ├── repositories/  project-repository.ts (interface),
│   │                  prisma-project-repository.ts, project-mapper.ts,
│   │                  normalize-project.ts, seed-data.ts,
│   │                  index.ts (composition point)
│   ├── validation/    project-schemas.ts
│   ├── errors.ts      AppError hierarchy
│   └── http.ts        route() wrapper, parseJsonBody()
│
└── types/  project.ts, lesson.ts, scene.ts, api.ts

prisma/schema.prisma          database schema
prisma/migrations/            versioned migrations (committed)
prisma.config.ts              Prisma CLI config (datasource URL)
scripts/import-json-store.ts  legacy JSON -> database import
scripts/seed-database.ts      sample library seeder
data/korean-learning-lab.db   SQLite file (gitignored)
```

### Persistence

Prisma 7 no longer takes a URL in `schema.prisma`. The connection lives in two
places that must stay in step:

- `prisma.config.ts` — for the CLI (`migrate`, `studio`). It loads `.env.local`
  itself, because the Prisma CLI does not.
- `src/server/db/client.ts` — builds `PrismaClient` with the
  `PrismaBetterSqlite3` driver adapter.

`DATABASE_URL` is a `file:` path resolved against the **project root** by both.

Schema decisions worth knowing before changing it:

- Enum-like columns are `String`. SQLite has no native enum, and the
  authoritative lists already live in `src/types/*` enforced by Zod. Do not
  duplicate them into the schema.
- `Project.pipeline`, `Lesson.sections`, and `Lesson.quiz` are JSON text. They
  are always read whole and never queried by inner fields.
- `Scene` **is** a table — scenes are ordered, individually edited, and carry
  media references. `SceneAudio` hangs off it 1:1.
- **Scenes are upserted, never recreated.** Recreating them would cascade away
  each scene's generated audio on every project save, including a lesson edit
  that never touched the storyboard. This is also why `(storyboardId, order)`
  is not unique: a reorder puts two scenes on the same order for one statement.
- The mapper (`src/server/repositories/project-mapper.ts`) is the only place
  rows become domain objects. The API shape did not change during the move.

| Command | Purpose |
| --- | --- |
| `npm run db:migrate` | Create + apply a migration from schema changes |
| `npm run db:deploy` | Apply existing migrations (non-interactive) |
| `npm run db:studio` | Browse the database |
| `npm run db:seed` | Insert the sample library (skips if non-empty; `-- --force`) |
| `npm run db:import` | Import a legacy `data/projects.json` (repeatable; `-- --dry-run`) |

## 5. Data Models

### VideoProject — `src/types/project.ts`

```ts
interface VideoProject {
  id: string;
  title: string;                 // defaults to a copy of topic on create
  topic: string;
  description: string;
  format: VideoFormat;           // "shorts" | "long" | "both"
  status: ProjectStatus;         // "draft" | "in_progress" | "completed"
  level: ProficiencyLevel;       // beginner | elementary | intermediate | advanced
  targetLanguage: TargetLanguage;// korean | english | chinese
  contentStyle: ContentStyle;    // vocabulary | grammar | conversation | pronunciation
                                 // | quiz | culture | food | travel
  visualStyle: VisualStyle;      // clean_educational | korean_lifestyle | cartoon
                                 // | minimal | realistic
  shortsDurationSeconds: 15 | 30 | 60 | null;      // null unless format produces a Short
  longDurationSeconds: 180 | 300 | 600 | null;     // null unless format produces a long cut
  lesson: StoredLesson | null;
  scenes: StoredScenes | null;
  pipeline: Record<PipelineStage, { status: StageStatus; updatedAt: string | null }>;
  createdAt: string;             // ISO 8601
  updatedAt: string;             // ISO 8601
}
```

Enums are `as const` arrays with derived union types — add a value to the array
and the type, `*_META` in `constants.ts`, and the Zod schema all follow.

`producesShorts(format)` / `producesLongForm(format)` encode the `"both"` rule.
Use them; do not compare format strings inline.

`PIPELINE_STAGES` = `topic, lesson, scenes, assets, voice, captions, preview,
render, youtube`. `STAGE_META[stage].implemented` gates the UI — `topic`,
`lesson`, `scenes`, and `preview` are `true`.

`preview` is `implemented` but its per-project stage status is never set to
`complete`: previewing produces no artifact, so there is nothing to record.
Do not auto-complete it on a page view.

Changing this list is a **data migration**: `normalizeProject()` rebuilds every
stored `pipeline` against it on read, carrying renamed stages over and
defaulting anything missing to pending. Bump `STORE_VERSION` when you change
it.

### Lesson — `src/types/lesson.ts`

**`Lesson` is snake_case on purpose.** It is the contract with the model,
generated / stored / edited as one document. The rest of the codebase is
camelCase. Do not "fix" this.

```ts
interface Lesson {
  title: string;
  hook: string;
  learning_objective: string;
  level: string;                 // human label, e.g. "Beginner"
  language: string;              // human label, e.g. "English"
  sections: LessonSection[];
  quiz: QuizQuestion[];
}

interface LessonSection {
  korean: string;        // Korean script only
  romanization: string;  // Revised Romanization of `korean`
  translation: string;
  explanation: string;
  example: string;
}

interface QuizQuestion {
  question: string;
  options: string[];
  answer: string;        // must match one of `options` exactly
}

// How a lesson is stored on a project — content is wrapped with provenance.
interface StoredLesson {
  content: Lesson;
  generatedAt: string;   // ISO 8601
  model: string;         // model id, or "mock"
  editedAt: string | null;
}
```

### Scene — `src/types/scene.ts`

Storyboard fields are **camelCase**, unlike `Lesson`. That matches the rest of
the codebase; the lesson is the exception, not this.

```ts
interface Scene {
  id: string;                  // assigned server-side, never by the model
  order: number;               // 1-based; renumbered from array order on save
  type: SceneType;             // hook | vocabulary | grammar | example | explanation
                               // | quiz | answer | practice | outro
  duration: number;            // seconds, 1–60
  koreanText: string;          // on-screen text; "" when the scene has none
  englishText: string;
  romanization: string;
  narration: string;           // what the voice-over says — never the same as on-screen text
  visualPrompt: string;        // image-generation prompt
  animation: SceneAnimation;   // none | fade_in | slide_up | slide_left | pop
                               // | zoom_in | typewriter
  background: string;
  transition: SceneTransition; // cut | fade | slide | zoom | dissolve
}

interface StoredScenes {
  scenes: Scene[];
  generatedAt: string;
  model: string;
  editedAt: string | null;
}
```

`animation` and `transition` are **enums rather than free text** so a renderer
can map each value to a real effect. Free-form strings would be
unimplementable in Step 8.

## 6. API Endpoints

Every response uses the envelope in `src/types/api.ts`:

```ts
{ ok: true,  data: T }
{ ok: false, error: { code, message, issues?: [{ field, message }] } }
```

`code` ∈ `validation_error | not_found | conflict | not_implemented |
generation_failed | internal_error`. `issues[].field` is a dot path
(`sections.0.korean`, `quiz.1.options`) that maps directly onto form state.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Status + which integrations are configured |
| GET | `/api/stats` | Dashboard counts |
| GET | `/api/projects` | List projects |
| POST | `/api/projects` | Create a project |
| GET | `/api/projects/[id]` | Fetch one project |
| PATCH | `/api/projects/[id]` | Update a project |
| DELETE | `/api/projects/[id]` | Delete a project |
| POST | `/api/lessons/generate` | Generate a lesson **without saving** |
| POST | `/api/projects/[id]/lesson` | Generate from the project's config **and save** |
| PUT | `/api/projects/[id]/lesson` | Save an edited lesson |
| POST | `/api/projects/[id]/scenes` | Build a storyboard from the saved lesson **and save** |
| PUT | `/api/projects/[id]/scenes` | Save an edited storyboard |
| GET | `/api/voices` | Available voices + provider capabilities |
| PUT | `/api/projects/[id]/voice-settings` | Save project voice settings |
| POST·DELETE | `/api/projects/[id]/scenes/[sceneId]/audio` | Generate / remove narration |
| GET | `/api/audio/[fileName]` | Serve a generated clip |

**`GET /api/projects`** — query `status`, `format`, `search`; validated by
`projectListFiltersSchema`. Returns `VideoProject[]`, newest-updated first.
400 on an invalid enum value.

**`POST /api/projects`** — body validated by `createProjectSchema`: `topic`
(3–200), `format`, `level`, `targetLanguage`, `contentStyle`, `visualStyle`,
optional `title`/`description`/durations. A `superRefine` requires a duration
for every cut the format produces (`both` needs both). Returns 201 +
`VideoProject`. 400 with per-field issues.

**`PATCH /api/projects/[id]`** — `updateProjectSchema`, all fields optional,
rejects an empty body. The service reconciles durations when `format` changes.
404 if missing.

**`POST /api/lessons/generate`** — body `{ topic, level, videoType, language,
style }`, validated inline in the route. Returns `{ lesson, model }`.
`maxDuration = 300`. Errors: 400 validation, 422 model refusal, 429 rate limit,
502 provider/parse failure.

**`POST /api/projects/[id]/lesson`** — no body; reads the project's own config
via `toGenerationRequest()`. Saves the lesson, sets `pipeline.lesson` to
`complete`, and moves `status` `draft → in_progress`. Returns the updated
`VideoProject`. `maxDuration = 300`.

**`PUT /api/projects/[id]/lesson`** — body is a full `Lesson`, validated by
`lessonEditSchema` (non-empty required fields, ≥1 section, ≥2 options per
question). Preserves the original `generatedAt`/`model` and sets `editedAt`.

**`POST /api/projects/[id]/scenes`** — no body; reads the project's lesson,
format, visual style, and target duration. **409 `conflict` when the project
has no lesson** — the storyboard is built from it. Assigns `id` and `order`
server-side, sets `pipeline.scenes` to `complete`, moves `status`
`draft → in_progress`. `maxDuration = 300`.

**`PUT /api/projects/[id]/scenes`** — body `{ scenes: Scene[] }`, validated by
`storyboardEditSchema` (1–120 scenes, narration required, duration 1–60).
`order` is renumbered from array position, so reordering is just array order.
Preserves the original `generatedAt`/`model` and sets `editedAt`.

All handlers are wrapped by `route()` in `src/server/http.ts`, which maps
`AppError` subclasses to their status and converts anything else into a 500
with no stack leaked to the client.

## 7. AI Architecture

**Provider selection** — `src/server/ai/index.ts` exposes
`getLessonGenerator()` and `getSceneGenerator()`. Each returns the Anthropic
implementation when `AI_API_KEY` is set, otherwise the mock. Cached on
`globalThis` to survive hot reloads. Services depend only on the
`LessonGenerator` / `SceneGenerator` interfaces.

**Two generators, one pattern.** Lessons are generated from the project's
configuration; storyboards are generated from the saved **lesson**. Both share
`src/server/ai/anthropic-errors.ts` (`toAppError`, `stopReasonError`) — add
error cases there, not in a provider.

**Prompt structure** — all in `src/server/ai/prompt.ts`:

- `LESSON_SYSTEM_PROMPT` — stable across requests (so it caches), carrying 8
  numbered rules: natural Korean, accuracy over fluency, strict separation of
  korean/romanization/translation, level as a ceiling, no unnecessary
  difficulty, useful examples, quiz integrity, hook style.
- `LEVEL_GUIDANCE` — per-level grammar and vocabulary ceilings.
- `formatGuidance()` — Shorts: 3–5 sections + 2 questions, one-sentence
  explanations. Long/both: 6–10 sections + 4–6 questions, 2–3 sentences.
- `CONTENT_STYLE_GUIDANCE` — what a section means for each of the 8 styles.

`src/server/ai/scene-prompt.ts` is the equivalent for storyboards: 8 rules
covering lesson coverage, one-idea-per-scene, required hook/outro and
quiz→answer pairing, the on-screen-text vs narration split, narration pacing
(~3 English words or 2 Korean syllables per second), an exact duration budget,
and visual-prompt style per `visualStyle`.

**Quality changes belong in `prompt.ts` / `scene-prompt.ts`**, never in a
provider, a service, or a route.

**Structured output** — `client.messages.parse()` with
`zodOutputFormat(lessonSchema)`. The response is schema-validated by the API,
not parsed out of prose. System prompt sent with
`cache_control: { type: "ephemeral" }`. `max_tokens: 16000`.

**Schema validation** — two schemas in `src/server/ai/lesson-schema.ts`:
`lessonSchema` (permissive — used as the model's output format; a lesson the
user can fix beats a rejected generation) and `lessonEditSchema` (strict — used
when a human saves). `reconcileQuizAnswers()` snaps an `answer` back onto a
matching option when a model returns a near-miss.

**Error handling** — `toAppError()` maps SDK errors to `AppError`s with safe
messages: `AuthenticationError` → 502, `RateLimitError` → 429,
`APIConnectionError` → 502, other `APIError` → 502. `stop_reason: "refusal"` →
422; `"max_tokens"` → 502; null `parsed_output` → 502.

**Retry behavior** — no application-level retry exists. The Anthropic SDK's
default (2 retries on 408/409/429/5xx and connection errors) applies because it
is not overridden. Retries are **manual** in the UI: a "Retry" button in
`GenerationProgress` and "Regenerate" in `LessonPanel`.

## 8. Development Rules

1. **Inspect before modifying.** Read the actual file. This codebase has
   deliberate, documented decisions that look like mistakes out of context.
2. **Preserve working functionality.** Steps 1–3 work. Do not rewrite them.
3. **No unnecessary rewrites.** Extend what exists. If a refactor seems
   required, say why and ask first.
4. **No unnecessary dependencies.** There is no state library, no ORM, no UI
   kit, no test runner — on purpose. Adding one is a decision to raise, not to
   make silently.
4. **Reuse existing components and services.** `src/components/ui/` has
   `Button`, `Card`, `Badge`, `Alert`, `Progress`, `Spinner`, `Skeleton`,
   `EmptyState`, `ErrorState`, and `field.tsx` (`Field`, `FieldSet`, `Input`,
   `Textarea`, `Select`, `OptionGroup`). Use them.
5. **Keep secrets server-side.** Keys are read only in `src/lib/env.ts` and
   `src/server/ai/**`. Never import either from a client component. Never
   prefix a secret with `NEXT_PUBLIC_`.
6. **Validate external and AI data.** Everything crossing a boundary — request
   bodies, query params, model output, stored records — goes through Zod.
7. **Strict TypeScript.** No `any`, no non-null assertions to silence the
   compiler, no `@ts-ignore`.
8. **Test your changes.** Run the verification commands in §10 and exercise the
   feature in a browser before reporting it done.

### Project-specific invariants

- Colours come from the tokens in `src/app/globals.css`. No hardcoded hex in
  components.
- Throw an `AppError` subclass; never return an ad-hoc error shape.
- **Never mark a pipeline stage complete for work that did not happen**, and
  never let mock output pass as real. Mock content must name itself as mock in
  every field a user reads.
- When adding a pipeline stage, follow the existing recipe: types → Zod schema
  → prompt → generator behind an interface → service → route → panel component
  → flip `STAGE_META[stage].implemented`.

## 9. Milestone Rules

**Implement ONE milestone at a time. Never implement future milestones
automatically.** If Step 4 is requested, do not start Step 5 — not even
scaffolding, types, or "while I'm here" groundwork.

For every milestone:

1. **Inspect** — read the code the change touches.
2. **Plan** — state the approach and the files affected.
3. **Implement** — the smallest change that does the job.
4. **Test** — run the §10 commands.
5. **Verify** — exercise the feature for real, in a browser or against the API.
6. **Report** — files changed, decisions made, and anything left unverified.

## 10. Verification

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
npm run build       # next build
npm run dev         # next dev, port 3000
```

**There is no test command.** No test runner, no test files. Do not claim tests
passed. If a change needs a test, propose adding the tooling.

`npm run typecheck` depends on route types Next generates during a build — run
`npm run build` or `npm run dev` at least once after cloning.

**Report only commands you actually ran, and only the results you actually
saw.** "Should work" is not verification. If something could not be verified —
because credentials are missing, or a path could not be exercised — say so
explicitly rather than implying success.

## 11. Roadmap

```
Step 1  — Project setup          → COMPLETE
Step 2  — Create Video workflow  → COMPLETE
Step 3  — AI Lesson Generator    → COMPLETE  (live API path unverified)
Step 4  — Scene Generator        → COMPLETE  (live API path unverified)
Step 5  — Video Preview          → COMPLETE
Step 6  — AI Voice               → COMPLETE (live provider unverified)
Step 7  — Captions               → NEXT
Step 8  — Video Rendering        → PLANNED
Step 9  — YouTube Metadata       → PLANNED
Step 10 — Content Library        → PLANNED
Step 11 — YouTube Publishing     → PLANNED
Step 12 — Production Readiness   → PLANNED
```

## 12. Known Limitations

Real issues found during the audit. None are hidden bugs — most are deliberate
trade-offs that now have an expiry date.

1. **All work is uncommitted.** Git holds exactly one commit
   (`Initial commit from Create Next App`). Steps 1–3 exist only in the working
   tree. This is the highest-risk issue in the repository.
2. **The live AI path has never executed** for either generator. See §2.
3. **SQLite is single-writer and local-file.** Fine for one creator on one
   machine, which is the current situation. It is not suitable for concurrent
   users or a serverless deployment; moving to Postgres is a Prisma provider
   change plus regenerated migrations.
4. **Generation runs inside the HTTP request** (`maxDuration = 300`). Workable
   for lessons, unworkable for voice synthesis and rendering. A job queue is
   needed before Steps 6 and 8.
5. **No tests anywhere.** Pure, easily-testable business rules — duration
   reconciliation, `"both"` stat counting, quiz answer reconciliation, the
   v1→v2 store migration — are all unverified by automation.
6. **Dead code.** `api.projects.list/get/update`, `api.stats.get`, and
   `api.lessons.generate` have no callers. `/api/stats` and `/api/health` have
   no in-app consumers.
7. **The server-only boundary is convention, not enforcement.** There is no
   `server-only` package guard. A stray import of `src/server/**` from a client
   component would pull secrets into the browser bundle. Currently clean —
   verified that `process.env.AI_API_KEY` appears nowhere in client chunks.
8. **Schema asymmetry.** `lessonSchema` accepts empty strings; `lessonEditSchema`
   rejects them. A sparse generation can save-fail until the user fills it in.
9. **Orphan env var** — `NEXT_PUBLIC_APP_URL` is in `.env.example` but is not
    in the `env.ts` schema and is referenced nowhere.
10. **`saveLesson`'s `model` argument is ignored when `edited: true`** — the
    route passes `"manual"`, the service preserves the original. Harmless,
    confusing.
11. **Dashboard stat overlap.** A `"both"` project counts toward both the
    Shorts and Long Videos tiles, so they intentionally do not sum to
    "Videos Created".

## Environment Variables

Names only — never commit or print values.

| Variable | Used? | Purpose |
|---|---|---|
| `DATA_DIR` | Yes | Where the JSON store is written (default `./data`) |
| `SEED_SAMPLE_DATA` | Yes | Seed example projects on first run |
| `AI_API_KEY` | Yes | Anthropic key. Blank → mock generator |
| `AI_MODEL` | Yes | Generation model (default `claude-opus-5`) |
| `NEXT_PUBLIC_APP_URL` | **No** | Declared but unused (see §12) |
| `ELEVENLABS_API_KEY` | **No** | Reserved for Step 6 |
| `YOUTUBE_CLIENT_ID` | **No** | Reserved for Step 11 |
| `YOUTUBE_CLIENT_SECRET` | **No** | Reserved for Step 11 |

Validated in `src/lib/env.ts` via `getServerEnv()`, which throws a descriptive
error on misconfiguration. `getFeatureAvailability()` derives booleans for the
Settings page — it exposes *whether* a key is set, never its value.

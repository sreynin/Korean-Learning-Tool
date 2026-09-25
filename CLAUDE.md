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

All nine stages exist as data in `PIPELINE_STAGES`. Everything except
`assets` is implemented.

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
| 7 | Captions | **COMPLETE** |
| 8 | Video Rendering | **COMPLETE** (see caveat) |
| 9 | YouTube Metadata | **COMPLETE** (live AI path unverified) |
| 10 | Content Library | **COMPLETE** |
| 11 | YouTube Publishing | NOT STARTED |
| 12 | Production Readiness | NOT STARTED |

**Steps 3 and 4 caveat — the live AI path has never been executed.** No
`AI_API_KEY` was available during development, so only `MockLessonGenerator`
and `MockSceneGenerator` were exercised end to end. The Anthropic generators
are written against the documented SDK API but have never made a real call.
Model id, structured-output behaviour, real latency, and error mapping are all
unproven. Set `AI_API_KEY` and generate once before relying on them.

**Step 8 caveat — real MP4s, placeholder visuals, no button.** `FfmpegRenderer`
encodes a playable H.264/AAC MP4 at 1080×1920 or 1920×1080, verified against
seeded projects. Two things are deliberately missing:

- **Scenes have no imagery.** `visualPrompt` is a prompt, not an asset, so each
  scene's backdrop is the same deterministic gradient the preview draws.
  Replacing it is a change to one function once the assets stage exists.
- **No render button.** A render is started through `POST
  /api/projects/[id]/renders` or `npm run render:worker`. The pipeline stage
  reports real job state either way.

**Step 10 caveat — the library manages projects, it does not upload them.**
Every card action runs against real data: Duplicate copies the lesson and
storyboard, Render starts a real job, Export downloads the encoded MP4 and
copies the stored metadata, Delete removes the project and its media.
**Mark published records what the creator did by hand** — it writes
`publishedAt` and an optional link, and uploads nothing. Step 11 is where
YouTube upload lands, and until then `published` is a bookkeeping status, not
evidence that a video exists on YouTube.

**Step 9 caveat — written, never published.** The metadata is generated,
editable, and stored, but nothing uploads it: `YOUTUBE_CLIENT_ID` and
`YOUTUBE_CLIENT_SECRET` are declared with **no code behind them**, and
Step 11 is where publishing lands. The thumbnail is text only — image
generation belongs to the assets stage.

## 3. Current Architecture

| Concern | Actual implementation |
|---|---|
| Framework | Next.js **16.3.6**, App Router, Turbopack |
| Runtime | React 19.2.8 |
| Language | TypeScript 5, `strict: true`, path alias `@/*` → `src/*` |
| Frontend | React Server Components by default; 23 `"use client"` components |
| Backend | Next.js route handlers under `src/app/api/`, thin HTTP boundary only |
| Database | **SQLite** at `data/korean-learning-lab.db`; generated audio as files under `data/audio/` |
| ORM | **Prisma 7.10.0** with the `better-sqlite3` driver adapter |
| Storage | Tables `Project` / `Lesson` / `Storyboard` / `Scene`, behind the `ProjectRepository` interface |
| AI provider | Anthropic via `@anthropic-ai/sdk` 0.128.0 |
| Voice provider | ElevenLabs via `fetch`, behind `TextToSpeechProvider` |
| Renderer | FFmpeg (`ffmpeg-static` binary, system FFmpeg preferred), behind `Renderer` |
| UI system | Tailwind CSS v4, CSS-first (`@theme inline`), custom primitives in `src/components/ui/` |
| State management | **No library.** `useState` / `useEffect` + `router.refresh()` |
| Validation | Zod 4.6.5, on every external boundary |
| Testing | `node:test` + `tsx`, no extra dependency. `npm test` |
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
│   ├── captions/  caption-settings-panel
│   ├── metadata/  metadata-panel
│   ├── preview/   preview-workspace, scene-stage, playback-controls,
│   │              preview-timeline, scene-properties, use-scene-playback
│   ├── projects/  project-card, project-grid, project-filters,
│   │              project-actions, project-thumbnail,
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
│   │   ├── metadata-generator.ts        the MetadataGenerator interface
│   │   ├── anthropic-metadata-generator.ts
│   │   ├── mock-metadata-generator.ts
│   │   ├── metadata-schema.ts           output + edit schemas + clamping
│   │   ├── metadata-prompt.ts           ALL metadata rules live here
│   │   ├── anthropic-errors.ts          shared SDK error mapping
│   │   └── index.ts                     provider selection
│   ├── tts/           text-to-speech-provider.ts (interface),
│   │                  elevenlabs-provider.ts, mock-provider.ts,
│   │                  audio-storage.ts, index.ts (provider selection)
│   ├── render/        renderer.ts (interface), ffmpeg-renderer.ts,
│   │                  frame-layout.ts (pure text/gradient geometry),
│   │                  ffmpeg.ts (binary resolution + process boundary),
│   │                  render-queue.ts (RenderQueue + runRenderJob),
│   │                  render-storage.ts, index.ts (composition point)
│   ├── services/      project-service.ts, library-service.ts, lesson-service.ts,
│   │                  scene-service.ts, voice-service.ts,
│   │                  caption-service.ts, pipeline-service.ts,
│   │                  render-service.ts, metadata-service.ts
│   ├── db/            client.ts (PrismaClient + driver adapter)
│   ├── repositories/  project-repository.ts (interface),
│   │                  prisma-project-repository.ts, project-mapper.ts,
│   │                  normalize-project.ts, seed-data.ts,
│   │                  render-job-repository.ts,
│   │                  index.ts (composition point)
│   ├── validation/    project-schemas.ts
│   ├── errors.ts      AppError hierarchy
│   └── http.ts        route() wrapper, parseJsonBody()
│
└── types/  project.ts, lesson.ts, scene.ts, voice.ts, caption.ts,
            render.ts, metadata.ts, api.ts

prisma/schema.prisma          database schema
prisma/migrations/            versioned migrations (committed)
prisma.config.ts              Prisma CLI config (datasource URL)
scripts/import-json-store.ts  legacy JSON -> database import
scripts/seed-database.ts      sample library seeder
scripts/repair-pipeline.ts    recompute stored stage status
scripts/render-worker.ts      drains render jobs from a separate process
tests/                        node:test suites + helpers/
data/korean-learning-lab.db   SQLite file (gitignored)
data/renders/                 finished render output (gitignored)
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
- `RenderJob` is a table because a render outlives the request that starts it.
  Every write against it is a **single short statement** — create, claim,
  progress, complete, fail. SQLite takes a write lock per statement, so a
  render must never happen inside one; `runRenderJob()` holds no transaction
  while FFmpeg runs. The row carries `format` (which cut), and on success the
  output's file name, content type, and byte size.

| Command | Purpose |
| --- | --- |
| `npm run db:migrate` | Create + apply a migration from schema changes |
| `npm run db:deploy` | Apply existing migrations (non-interactive) |
| `npm run db:studio` | Browse the database |
| `npm run db:seed` | Insert the sample library (skips if non-empty; `-- --force`) |
| `npm run db:import` | Import a legacy `data/projects.json` (repeatable; `-- --dry-run`) |
| `npm run db:repair-pipeline` | Recompute every project's stage status from its real content |
| `npm run render:worker` | Drain render jobs in a separate process (`-- --watch` to keep polling) |
| `npm test` | Run the test suite |

## 5. Data Models

### VideoProject — `src/types/project.ts`

```ts
interface VideoProject {
  id: string;
  title: string;                 // defaults to a copy of topic on create
  topic: string;
  description: string;
  format: VideoFormat;           // "shorts" | "long" | "both"
  status: ProjectStatus;         // draft | lesson_ready | scenes_ready | voice_ready
                                 // | ready_to_render | rendering | completed | published
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
  publishedAt: string | null;    // set by hand — nothing uploads to YouTube yet
  youtubeUrl: string | null;     // optional link the creator pasted
  posterUrl: string | null;      // a still from the render, for the library card
  createdAt: string;             // ISO 8601
  updatedAt: string;             // ISO 8601
}
```

Enums are `as const` arrays with derived union types — add a value to the array
and the type, `*_META` in `constants.ts`, and the Zod schema all follow.

`producesShorts(format)` / `producesLongForm(format)` encode the `"both"` rule.
Use them; do not compare format strings inline.

`PIPELINE_STAGES` = `topic, lesson, scenes, assets, voice, captions, preview,
render, youtube`. `STAGE_META[stage].implemented` gates the UI — everything
except `assets` is `true`.

**Status is derived too, and it outranks the stages.** `deriveProjectStatus()`
reads the same content and returns the first of these that holds: `published`
(the creator said so), `completed` (a render produced output), `rendering` (a
job is in flight), `ready_to_render` (every scene voiced *and* captions
chosen), `voice_ready` (every scene voiced), `scenes_ready`, `lesson_ready`,
`draft`. The eight statuses are the library's filter list, so a card's badge
and the chip that finds it are computed from one function.

`published` is the only one a human sets, and it is a bookkeeping flag — see
the Step 10 caveat in §2.

**Stage status is derived, never set.** `reconcilePipeline()` in
`src/server/services/pipeline-service.ts` computes every stage from what the
project actually contains, and `syncPipeline()` persists it. Nothing else may
write `pipeline` — four services used to each hold their own idea of
"complete" and they drifted.

The rules:

- `topic` completes at creation (the topic is the creation input).
- `lesson`, `scenes` complete when that artifact exists.
- `voice` is `in_progress` while only some scenes have audio.
- `captions` completes when settings are **saved** (`captionsConfigured`) and a
  storyboard exists. Defaults applied for rendering do not count.
- `preview` completes on an explicit review (`previewReviewedAt`), never on a
  page view.
- `render` follows the job, not the button: no job (or only failed ones) is
  `pending`, an active job is `in_progress`, and a job that produced output is
  `complete`. Creating a job never completes the stage, and a failed retry
  cannot erase an earlier render that is still on disk.
- `youtube` completes when every cut the project produces has metadata. A
  `both` project with only its Short written is `in_progress`, not complete.
- `assets` is forced to `pending` — it has no implementation, so no stored
  value may claim otherwise.

Deleting an artifact reverts its stage. Run `npm run db:repair-pipeline` after
changing these rules to bring existing rows in line — it recomputes `status`
as well as the stages.

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

### Captions — `src/types/caption.ts`

**Captions are not separate text.** They are how a scene's existing
`koreanText`, `romanization`, and `englishText` are drawn on the frame.
Duplicating the strings would let the subtitle and the storyboard drift apart,
so `CaptionSettings` governs the same fields the preview already reads.

- `CaptionSettings` lives on the **project** (one consistent look): font size,
  position, alignment, animation, and per-layer visibility.
- `highlightTerms` lives on the **scene** — substrings of `koreanText` to
  emphasise, e.g. `["김치"]` renders 저는 [김치]를 좋아해요.
- `segmentCaption()` is the single splitter both the preview and any future
  renderer consume. Longer terms match first so an overlapping shorter term
  cannot claim part of a longer one.

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

`animation` and `transition` are **enums rather than free text** so the
renderer can map each value to a real effect. Free-form strings would be
unimplementable. Every value is exercised against FFmpeg in
`tests/render-ffmpeg.test.ts` — a filter string that is merely wrong still
type-checks, so adding a value means adding a case there.

### RenderJob — `src/types/render.ts`

```ts
interface RenderJob {
  id: string;
  projectId: string;
  format: RenderFormat;      // "shorts" | "long"
  status: RenderStatus;      // pending | queued | processing | completed | failed
  progress: number;          // 0-100, reported as each scene finishes
  errorMessage: string | null;
  outputUrl: string | null;  // /api/renders/<file>, null until one exists
  contentType: string | null;
  byteSize: number | null;
  createdAt: string;
  startedAt: string | null;  // set on claim
  completedAt: string | null;
}
```

A `both` project renders one job per cut, so `format` lives on the job. The
output is named after the job id, which makes every file traceable and means
no render can overwrite another.

### VideoMetadata — `src/types/metadata.ts`

```ts
interface VideoMetadata {
  title: string;          // ≤100 chars
  description: string;    // ≤5000
  hashtags: string[];     // written with their leading #, ≤6
  tags: string[];         // plain keywords, ≤15, ≤500 chars together
  thumbnailText: string;  // ≤30 chars, so it stays readable
  pinnedComment: string;  // ≤500
}

interface StoredMetadata {
  format: MetadataFormat; // "shorts" | "long"
  content: VideoMetadata;
  generatedAt: string;
  model: string;
  editedAt: string | null;
}
```

**Metadata is stored per cut**, in its own table keyed by
`(projectId, format)`. A Short and a long-form video of the same lesson want
different titles — the Short ends with `#Shorts`, the long one is descriptive
and searchable — so a `both` project carries one document for each. That is
also why the `youtube` stage is only complete when every cut has one.

Every field can be regenerated on its own. `generateField` exists on the
generator interface for that reason: rewriting a title by regenerating the
whole document would throw away five good values and cost five times as much.
The other fields go to the model as context so the replacement fits them.

`clampMetadata()` trims a generation into the limits instead of rejecting it —
a title cut to 100 characters is something the creator can edit, a failed
generation is not. Its output always satisfies `metadataEditSchema`, the
strict schema a human save must pass.

### How a render runs — `src/server/render/`

```
POST /renders → job row → queue → runRenderJob → FfmpegRenderer → MP4
```

- **Per scene, one segment.** Each scene is encoded on its own and the
  segments are concatenated with a stream copy. That keeps durations exact
  (nothing overlaps two scenes), makes progress real (reported as each scene
  lands, weighted by duration), and means a scene's backdrop is one input to
  swap when real imagery arrives.
- **`frame-layout.ts` is pure.** Font sizes, wrapping, stacking, and the
  gradient are arithmetic with no FFmpeg involved, so the geometry is testable
  on its own. It is the preview's layout in pixels: same 8% side padding, same
  font scale, same layer order.
- **Each wrapped line is its own `drawtext`.** FFmpeg aligns a multi-line
  block by its widest line, which leaves a centred caption ragged.
- **Text is passed by file, never inline.** Lesson text contains quotes,
  colons, and commas, all of which are filtergraph syntax. Expressions are
  quoted and written without spaces for the same reason.
- **Audio is optional.** A scene with narration uses the clip, padded with
  silence to the scene length; a scene without gets `anullsrc`. Every segment
  therefore has an identical audio track, which is what makes the stream-copy
  join safe.
- **Cancellation kills the process.** `AbortSignal` reaches each spawn, and
  the scratch directory is removed in a `finally`, so a cancelled or failed
  render leaves no partial file and never reports completion.

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
| POST | `/api/projects/[id]/duplicate` | Copy a project into a new draft |
| PUT | `/api/projects/[id]/publish` | Record that the creator published it |
| POST | `/api/lessons/generate` | Generate a lesson **without saving** |
| POST | `/api/projects/[id]/lesson` | Generate from the project's config **and save** |
| PUT | `/api/projects/[id]/lesson` | Save an edited lesson |
| POST | `/api/projects/[id]/scenes` | Build a storyboard from the saved lesson **and save** |
| PUT | `/api/projects/[id]/scenes` | Save an edited storyboard |
| GET | `/api/voices` | Available voices + provider capabilities |
| PUT | `/api/projects/[id]/voice-settings` | Save project voice settings |
| PUT | `/api/projects/[id]/caption-settings` | Save caption presentation settings |
| POST·DELETE | `/api/projects/[id]/scenes/[sceneId]/audio` | Generate / remove narration |
| GET | `/api/audio/[fileName]` | Serve a generated clip |
| POST | `/api/projects/[id]/metadata` | Write YouTube metadata for one cut |
| PUT | `/api/projects/[id]/metadata` | Save edited metadata |
| POST | `/api/projects/[id]/metadata/[field]` | Rewrite one field, keeping the rest |
| POST | `/api/projects/[id]/renders` | Create a render job and return immediately |
| GET | `/api/projects/[id]/renders` | List a project's render jobs |
| GET | `/api/projects/[id]/renders/[jobId]` | Poll one job's status and progress |
| GET | `/api/renders/[fileName]` | Serve a finished render (`video/mp4`, range requests) |
| PUT | `/api/projects/[id]/preview-review` | Record that the preview was reviewed |

**`GET /api/projects`** — query `status`, `format`, `level`, `search`;
validated by `projectListFiltersSchema`. Returns `VideoProject[]`,
newest-updated first. 400 on an invalid enum value. Filters combine (they
narrow, never widen), and `search` matches title **or** topic, case-insensitively.

A filter that the type, the schema, and the repository all handle can still be
dropped by the route that reads the query string — that happened to `level`.
`tests/library.test.ts` now walks every key of `ProjectListFilters` through the
real handler for that reason.

**`POST /api/projects/[id]/duplicate`** — no body. Copies title (suffixed
`(copy)`, then `(copy 2)`…), topic, configuration, lesson, and storyboard into
a new project, giving the copied scenes fresh ids. **Generated audio, renders,
metadata, and the published record are not copied** — the copy's status is
derived from what it actually holds, so it comes back a draft or
`scenes_ready`, never `completed`. 404 if the original is missing.

**`PUT /api/projects/[id]/publish`** — body `{ published: boolean, youtubeUrl?:
string }`. Sets or clears `publishedAt` and the link; 400 when `youtubeUrl` is
not a URL. **This uploads nothing** — it records something the creator did
elsewhere. Publishing requires an existing render, so a project cannot claim to
be published when no video was ever produced.

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

**`POST /api/projects/[id]/renders`** — body is optional: `{ format }` picks
the cut for a `both` project, defaulting to `shorts`, and asking for a cut the
project does not produce is a 400. 409 when the project has no storyboard, or
when a render is already in flight. Returns 201 with the job and the project.
**No `maxDuration`** — the route creates the job and returns; the render
happens on the queue.

All handlers are wrapped by `route()` in `src/server/http.ts`, which maps
`AppError` subclasses to their status and converts anything else into a 500
with no stack leaked to the client.

## 7. AI Architecture

**Provider selection** — `src/server/ai/index.ts` exposes
`getLessonGenerator()`, `getSceneGenerator()`, and `getMetadataGenerator()`.
Each returns the Anthropic implementation when `AI_API_KEY` is set, otherwise
the mock. Cached on `globalThis` to survive hot reloads. Services depend only
on the interfaces.

**Three generators, one pattern.** Lessons come from the project's
configuration; storyboards and YouTube metadata both come from the saved
**lesson**. All three share `src/server/ai/anthropic-errors.ts` (`toAppError`,
`stopReasonError`) — add error cases there, not in a provider.

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

`src/server/ai/metadata-prompt.ts` is the equivalent for YouTube metadata: 10
rules covering accuracy to the real lesson, **no claims about views,
virality, or the algorithm**, no clickbait the video does not honour, the
per-field limits, and the title style for each cut — `#Shorts` on a Short, a
descriptive `Topic | Korean for Beginners` on a long-form video.

**Quality changes belong in `prompt.ts` / `scene-prompt.ts` /
`metadata-prompt.ts`**, never in a provider, a service, or a route.

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

`npm test` runs `node:test` via `tsx` over `tests/**/*.test.ts`. Each test file
migrates its own temporary SQLite database, so tests exercise the real schema
and never touch `data/`. The suite is deliberately small — persistence,
derived stage status, and the data-loss guard. Add to it when a change could
silently destroy stored work.

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
Step 7  — Captions               → COMPLETE
Step 8  — Video Rendering        → COMPLETE (placeholder visuals, no button)
Step 9  — YouTube Metadata       → COMPLETE (live API path unverified)
Step 10 — Content Library        → COMPLETE (publishing is recorded, not uploaded)
Step 11 — YouTube Publishing     → NEXT
Step 12 — Production Readiness   → PLANNED
```

## 12. Known Limitations

Real issues found during the audit. None are hidden bugs — most are deliberate
trade-offs that now have an expiry date.

1. **The database is not in git, and nothing backs it up.** Every step is
   committed and pushed to `origin/main`, but `data/` is gitignored — the
   SQLite file, generated audio, and finished renders exist only on this
   machine. Losing the disk loses every project.
2. **The live AI path has never executed** for any of the three generators —
   lesson, scene, or metadata. See §2.
3. **SQLite is single-writer and local-file.** Fine for one creator on one
   machine, which is the current situation. It is not suitable for concurrent
   users or a serverless deployment; moving to Postgres is a Prisma provider
   change plus regenerated migrations.
4. **Lesson, scene, and voice generation still run inside the HTTP request**
   (`maxDuration = 300`). Rendering no longer does — it goes through the render
   job — but the generators have not been moved onto the same mechanism.
5. **The render queue is in-process.** `InProcessRenderQueue` runs a job after
   the request returns, in the app's own process: work in flight is lost if the
   process exits, and it does not span instances. `scripts/render-worker.ts`
   proves the job row is the only coupling, and replacing the queue is one new
   `RenderQueue` implementation.
6. **Tests cover persistence, stage rules, and rendering only.** Duration
   reconciliation, `"both"` stat counting, and quiz answer reconciliation are
   still unverified by automation.
7. **Rendered video has no imagery, and no highlight colour.** Backdrops are
   gradients because no assets exist. `highlightTerms` is drawn plain in the
   video though the preview colours it — inline multi-colour text would need
   per-run width measurement that FFmpeg's `drawtext` cannot provide.
   `slide` renders as a fade for the same reason: there is nothing behind a
   scene to slide over.
8. **Rendering is CPU-bound and unbounded in time.** A 30-second Short takes
   about 4 seconds; a 10-minute long-form cut took 66 seconds on an M-series
   Mac. Nothing limits how many renders run at once beyond one job per
   project.
9. **Dead code.** `api.projects.list/get`, `api.stats.get`, and
   `api.lessons.generate` have no callers. `/api/stats` and `/api/health` have
   no in-app consumers.
10. **The server-only boundary is convention, not enforcement.** There is no
   `server-only` package guard. A stray import of `src/server/**` from a client
   component would pull secrets into the browser bundle. Currently clean —
   verified that `process.env.AI_API_KEY` appears nowhere in client chunks.
11. **Schema asymmetry.** `lessonSchema` accepts empty strings; `lessonEditSchema`
   rejects them. A sparse generation can save-fail until the user fills it in.
12. **Orphan env var** — `NEXT_PUBLIC_APP_URL` is in `.env.example` but is not
    in the `env.ts` schema and is referenced nowhere.
13. **`saveLesson`'s `model` argument is ignored when `edited: true`** — the
    route passes `"manual"`, the service preserves the original. Harmless,
    confusing.
14. **Dashboard stat overlap.** A `"both"` project counts toward both the
    Shorts and Long Videos tiles, so they intentionally do not sum to
    "Videos Created".
15. **`published` is self-reported.** Marking a project published writes a
    timestamp and an optional link. Nothing checks the link, and nothing
    uploads. Step 11 replaces the claim with an actual upload.
16. **Export copies text through the clipboard.** `navigator.clipboard` needs
    a focused, permitted document; when it is refused the card says so rather
    than failing silently, but there is no fallback for a browser that blocks
    it outright. The MP4 download is a plain link and has no such dependency.
17. **A `both` project exports only its first cut.** The Export menu links the
    latest render and reads the metadata for `metadataFormats(format)[0]`, so
    a project producing both cuts shows its Short. Both documents are stored;
    only one is reachable from the card.

## Environment Variables

Names only — never commit or print values.

| Variable | Used? | Purpose |
|---|---|---|
| `DATABASE_URL` | Yes | SQLite file, resolved from the project root |
| `AI_API_KEY` | Yes | Anthropic key. Blank → mock generator |
| `AI_MODEL` | Yes | Generation model (default `claude-opus-5`) |
| `ELEVENLABS_API_KEY` | Yes | Voice key. Blank → mock voice provider |
| `ELEVENLABS_MODEL` | Yes | Voice model (default `eleven_multilingual_v2`) |
| `RENDER_FONT_PATH` | Yes | Font for on-screen text. Blank → search system paths |
| `NEXT_PUBLIC_APP_URL` | **No** | Declared but unused (see §12) |
| `YOUTUBE_CLIENT_ID` | **No** | Reserved for Step 11 |
| `YOUTUBE_CLIENT_SECRET` | **No** | Reserved for Step 11 |

Validated in `src/lib/env.ts` via `getServerEnv()`, which throws a descriptive
error on misconfiguration. `getFeatureAvailability()` derives booleans for the
Settings page — it exposes *whether* a key is set, never its value.

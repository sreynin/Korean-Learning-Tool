<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Korean Learning Lab conventions

See `README.md` for the full architecture. The rules that are easy to break:

- `src/server/**` is server-only. Never import it from a client component —
  `src/lib/env.ts` reads secrets.
- Server components read through the service layer directly. Client components
  mutate through `src/lib/api-client.ts`. Do not fetch `/api` from a server
  component.
- Business rules belong in `src/server/services/`, not in route handlers and not
  in components. Repositories are dumb persistence.
- Every API response uses the `{ ok, data } | { ok, error }` envelope. Throw an
  `AppError` subclass rather than returning an ad-hoc error shape.
- Colours come from the tokens in `src/app/globals.css`. No hardcoded hex values
  in components.
- Pipeline stages beyond `topic` and `lesson` are not implemented. Keep them
  read-only until their feature is actually built, and never mark a stage
  complete for work that did not happen.
- AI keys live in `src/lib/env.ts` and are read only under `src/server/ai/**`.
  Never import either from a client component.
- Lesson prompt quality lives in `src/server/ai/prompt.ts`. Change teaching
  rules there, not in the provider or the route handler.
- The `Lesson` type is snake_case because it is the contract with the model.
  That is deliberate — do not "fix" it to camelCase.

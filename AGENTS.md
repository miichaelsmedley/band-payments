<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Working notes

Maintainers may keep dated handover notes and the original brief in `.private/` (git-ignored). Read `.private/HANDOVER.md` first when it exists. Treat it as dated context, not proof of current runtime, test results or provider access; verify against the code and live systems before changing behaviour.

## Non-negotiables

Read `docs/architecture.md` (money and safety rules) and `docs/operations.md` before changing behaviour. Never weaken session, RLS, MFA, scan or payment guards; never invent provider endpoints or return simulated payment success; never commit secrets, `.local/`, `.env*` or real people's data.

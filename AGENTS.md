<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Deployment

When the user asks to deploy the latest version, read `DEPLOYMENT.md` and run
`python scripts/deploy.py`. Target: `62.234.114.47:8082`, SSH user `ubuntu`,
existing local key `~/.ssh/codex_tencent_deploy`. Public URL:
`https://linkora.mizki.online`. Preserve the separate `linkora-domain` Nginx
configuration and HTTPS APP_ORIGIN. Never commit credentials.
Preserve server data and uploads during subsequent deployments.

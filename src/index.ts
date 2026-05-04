import { createApp } from './server/server.ts';

/**
 * Entry point — reads env, builds the app, binds the HTTP server.
 *
 * Env vars:
 * - `PORT` (default 4000)
 * - `HOST` (default 127.0.0.1; set to 0.0.0.0 to expose, combine with reverse proxy + auth)
 * - `CORS_ORIGINS` comma-separated whitelist (empty → CORS disabled)
 */
const port = process.env.PORT ? Number(process.env.PORT) : 4000;
const hostname = process.env.HOST ?? '127.0.0.1';
const corsOrigins = process.env.CORS_ORIGINS?.split(',')
	.map((s) => s.trim())
	.filter(Boolean);

const yoga = createApp({ corsOrigins });
const server = Bun.serve({ port, hostname, fetch: yoga });
console.log(`✓ claude-data-api on http://${server.hostname}:${server.port}/graphql`);

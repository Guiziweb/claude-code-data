import { createYoga } from 'graphql-yoga';
import { schema } from './schema/index.ts';

/**
 * GraphQL handler factory.
 *
 * Defaults are intentionally restrictive — CORS disabled, no landing page.
 * The API exposes the full content of `~/.claude/`, which can include sensitive
 * material. Whitelist browser origins via `corsOrigins` only when needed.
 */

export type AppConfig = {
	/** Browser origins allowed via CORS. Empty array → CORS fully disabled. */
	corsOrigins?: string[];
};

/** Builds the Yoga handler with the given config. Pure function — no side effects. */
export function createApp(config: AppConfig = {}) {
	const origins = config.corsOrigins ?? [];
	return createYoga({
		schema,
		graphiql: true,
		landingPage: false,
		cors:
			origins.length > 0
				? { origin: origins, credentials: true, methods: ['POST', 'GET', 'OPTIONS'] }
				: false,
	});
}

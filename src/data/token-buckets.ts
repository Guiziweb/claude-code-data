import type { TokenBuckets } from './types/parsed-session';

export function emptyTokenBuckets(): TokenBuckets {
	return { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 };
}

/**
 * Adds token buckets together. Returns a new object; the inputs are not modified.
 *
 * @example
 * ```ts
 * // Main transcript + every subagent
 * let total = session.tokens;
 * for await (const sub of readSubagents(dir, id)) total = sumTokenBuckets(total, sub.tokens);
 * ```
 */
export function sumTokenBuckets(...buckets: TokenBuckets[]): TokenBuckets {
	const total = emptyTokenBuckets();
	for (const bucket of buckets) {
		total.input += bucket.input;
		total.output += bucket.output;
		total.cacheRead += bucket.cacheRead;
		total.cacheCreation += bucket.cacheCreation;
	}
	return total;
}

import { createReadStream, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import type { SessionEntry } from '../types/jsonl-events';
import { safeParseEntry } from '../types/jsonl-events';

// Legacy progress entries have type:'progress' + uuid + parentUuid.
// They are not in the Entry union anymore but still exist on old transcripts — skip silently.
function isLegacyProgress(parsed: unknown): boolean {
	return (
		typeof parsed === 'object' &&
		parsed !== null &&
		(parsed as { type?: unknown }).type === 'progress'
	);
}

/**
 * Reads a Claude Code session file (`.jsonl`) and yields each entry one by one.
 *
 * Memory-bounded — streams line by line, never loads the full file.
 * Silently skips corrupted lines, unknown event types, and legacy entries.
 * Returns an empty stream if the file does not exist.
 *
 * @param filePath Absolute path to a `.jsonl` session file (e.g. `~/.claude/projects/<slug>/<sessionId>.jsonl`)
 *
 * @example
 * ```ts
 * for await (const entry of parseJsonlStream('/path/to/session.jsonl')) {
 *   console.log(entry.type); // 'user' | 'assistant' | 'custom-title' | ...
 * }
 * ```
 */
export async function* parseJsonlStream(filePath: string): AsyncIterable<SessionEntry> {
	if (!existsSync(filePath)) return;

	const rl = createInterface({
		input: createReadStream(filePath, { encoding: 'utf8' }),
		crlfDelay: Infinity,
	});

	for await (const line of rl) {
		if (line.length === 0) continue;

		let parsed: unknown;
		try {
			parsed = JSON.parse(line);
		} catch {
			continue;
		}

		if (isLegacyProgress(parsed)) continue;

		const entry = safeParseEntry(parsed);
		if (entry !== null) yield entry;
	}
}

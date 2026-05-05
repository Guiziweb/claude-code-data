import { createReadStream, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import type { EntryV01 } from '../types/jsonl-events';
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

export async function* parseJsonlStream(filePath: string): AsyncIterable<EntryV01> {
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

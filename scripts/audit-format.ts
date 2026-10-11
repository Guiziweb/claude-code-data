// Scans local Claude Code session files and reports format drift against this library.
//
//   bun run audit [projectsDir]   (defaults to ~/.claude/projects)
//
// - "rejected": a known entry type that fails validation — those entries are silently
//   dropped by the parser. Any count here is a bug to fix. Exits with code 1.
// - "unknown": entry types the parser does not model. Informational — check whether a
//   new one carries data worth exposing.

import type { Dirent } from 'node:fs';
import { createReadStream } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { KNOWN_ENTRY_TYPES, safeParseEntry } from '../src/data/types/jsonl-events';

// Mirrors the parser: legacy entries skipped on purpose (see src/data/parser/jsonl.ts).
const IGNORED_TYPES = new Set(['progress']);

const root = process.argv[2] ?? join(homedir(), '.claude', 'projects');

async function* walkJsonl(dir: string): AsyncGenerator<string> {
	let entries: Dirent[];
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch {
		return;
	}
	for (const entry of entries) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) yield* walkJsonl(path);
		else if (isSessionFile(entry.name)) yield path;
	}
}

const SESSION_FILE_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jsonl$/;

// Only the files the parser reads: `<sessionId>.jsonl` and `agent-<id>.jsonl`.
// Skips other JSONL files CC keeps alongside (e.g. workflow `journal.jsonl`).
function isSessionFile(name: string): boolean {
	return name.endsWith('.jsonl') && (name.startsWith('agent-') || SESSION_FILE_RE.test(name));
}

const rejectedByType = new Map<string, { count: number; example: string }>();
const unknownByType = new Map<string, { count: number; example: string }>();
let files = 0;
let lines = 0;

for await (const file of walkJsonl(root)) {
	files++;
	const rl = createInterface({ input: createReadStream(file, 'utf8'), crlfDelay: Infinity });
	for await (const line of rl) {
		if (line.length === 0) continue;
		let raw: unknown;
		try {
			raw = JSON.parse(line);
		} catch {
			continue;
		}
		lines++;
		const type =
			typeof raw === 'object' && raw !== null
				? String((raw as { type?: unknown }).type)
				: typeof raw;
		if (IGNORED_TYPES.has(type)) continue;
		if (safeParseEntry(raw)) continue;
		const target = KNOWN_ENTRY_TYPES.has(type) ? rejectedByType : unknownByType;
		const bucket = target.get(type) ?? { count: 0, example: file };
		bucket.count++;
		target.set(type, bucket);
	}
}

console.log(`Scanned ${lines} entries in ${files} files under ${root}\n`);
report('Rejected (known type, failed validation — entries dropped)', rejectedByType);
report('Unknown types (not modelled)', unknownByType);

if (rejectedByType.size === 0) console.log('No rejected entries.');
process.exit(rejectedByType.size > 0 ? 1 : 0);

function report(title: string, map: Map<string, { count: number; example: string }>): void {
	if (map.size === 0) return;
	console.log(`${title}:`);
	for (const [type, { count, example }] of [...map].sort((a, b) => b[1].count - a[1].count)) {
		console.log(`  ${type.padEnd(28)} ${String(count).padStart(7)}  e.g. ${example}`);
	}
	console.log();
}

import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { parseJsonlStream } from '../../src/data/parser/jsonl';

const FIXTURES = join(import.meta.dir, '..', 'fixtures', 'synthetic', 'sessions');

async function collect(filePath: string) {
	const entries = [];
	for await (const entry of parseJsonlStream(filePath)) {
		entries.push(entry);
	}
	return entries;
}

describe('parseJsonlStream()', () => {
	test('yields typed entries from minimal session', async () => {
		const entries = await collect(join(FIXTURES, 'session-minimal.jsonl'));
		expect(entries).toHaveLength(2);
		expect(entries[0].type).toBe('user');
		expect(entries[1].type).toBe('assistant');
	});

	test('yields all V0.1 event types including meta', async () => {
		const entries = await collect(join(FIXTURES, 'session-with-meta.jsonl'));
		const types = entries.map((e) => e.type);
		expect(types).toContain('user');
		expect(types).toContain('assistant');
		expect(types).toContain('custom-title');
		expect(types).toContain('ai-title');
		expect(types).toContain('last-prompt');
		expect(types).toContain('pr-link');
	});

	test('skips corrupted lines without throwing', async () => {
		const entries = await collect(join(FIXTURES, 'session-corrupted-lines.jsonl'));
		expect(entries).toHaveLength(2);
		expect(entries[0].type).toBe('user');
		expect(entries[1].type).toBe('assistant');
	});

	test('skips unknown variants silently', async () => {
		const entries = await collect(join(FIXTURES, 'session-with-unknown-events.jsonl'));
		expect(entries).toHaveLength(2);
		const types = entries.map((e) => e.type);
		expect(types).not.toContain('file-history-snapshot');
		expect(types).not.toContain('permission-mode');
	});

	test('skips legacy progress entries', async () => {
		const entries = await collect(join(FIXTURES, 'session-with-legacy-progress.jsonl'));
		expect(entries).toHaveLength(2);
		const types = entries.map((e) => e.type);
		expect(types).not.toContain('progress');
	});

	test('returns empty iterable for non-existent file', async () => {
		const entries = await collect(join(FIXTURES, 'does-not-exist.jsonl'));
		expect(entries).toHaveLength(0);
	});
});

import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { parseJsonlStream } from '../../src/data/parser/jsonl';
import { aggregateSession } from '../../src/data/parser/session-meta';

const FIXTURES = join(import.meta.dir, '..', 'fixtures', 'synthetic', 'sessions');

async function parse(file: string) {
	return aggregateSession(parseJsonlStream(join(FIXTURES, file)));
}

describe('aggregateSession()', () => {
	test('minimal session — timestamps, duration, turns', async () => {
		const s = await parse('session-minimal.jsonl');
		expect(s.sessionId).toBe('00000000-0000-0000-0000-000000000aaa');
		expect(s.firstTimestamp).toBe('2026-05-01T10:00:00.000Z');
		expect(s.lastTimestamp).toBe('2026-05-01T10:00:01.000Z');
		expect(s.durationMs).toBe(1000);
		expect(s.turns).toHaveLength(2);
		expect(s.subagentTurns.size).toBe(0);
	});

	test('meta events — last-wins', async () => {
		const s = await parse('session-with-meta.jsonl');
		expect(s.customTitle).toBe('My session');
		expect(s.aiTitle).toBe('Session about greetings');
		expect(s.lastPrompt).toBe('Hello');
		expect(s.prNumber).toBe(42);
		expect(s.prUrl).toBe('https://github.com/owner/repo/pull/42');
		expect(s.prRepository).toBe('owner/repo');
	});

	test('firstUserText — first non-meta text', async () => {
		const s = await parse('session-minimal.jsonl');
		expect(s.firstUserText).toBe('Hello');
	});

	test('firstUserText — skips isMeta messages', async () => {
		const s = await parse('session-meta-messages.jsonl');
		expect(s.firstUserText).toBe('real first prompt');
	});

	test('lastModel — last non-synthetic assistant model', async () => {
		const s = await parse('session-synthetic-model.jsonl');
		expect(s.lastModel).toBe('claude-sonnet-4-6');
	});

	test('gitBranch — last-wins', async () => {
		const s = await parse('session-multi-models.jsonl');
		expect(s.gitBranch).toBe('main');
	});

	test('worktreePath — null after exit event', async () => {
		const s = await parse('session-worktree-enter-exit.jsonl');
		expect(s.worktreePath).toBeNull();
	});

	test('worktreePath — undefined when no worktree event', async () => {
		const s = await parse('session-minimal.jsonl');
		expect(s.worktreePath).toBeUndefined();
	});

	test('subagentTurns — separated from main turns', async () => {
		const s = await parse('session-subagents.jsonl');
		expect(s.turns).toHaveLength(2);
		expect(s.subagentTurns.size).toBe(1);
		expect(s.subagentTurns.get('agent-abc123')).toHaveLength(2);
	});

	test('firstUserText — skips tool_result-only messages', async () => {
		const s = await parse('session-tool-result-only.jsonl');
		expect(s.firstUserText).toBe('Real prompt');
	});

	test('firstUserText — string content (legacy format)', async () => {
		const s = await parse('session-string-content.jsonl');
		expect(s.firstUserText).toBe('Hello from string content');
	});

	test('dedup — assistant entries replayed after /resume are counted once', async () => {
		const s = await parse('session-resumed.jsonl');
		expect(s.turns).toHaveLength(2); // 1 user + 1 assistant (not 3)
	});

	test('empty session — zero values', async () => {
		const s = await parse('does-not-exist.jsonl');
		expect(s.sessionId).toBeUndefined();
		expect(s.turns).toHaveLength(0);
		expect(s.durationMs).toBe(0);
		expect(s.firstUserText).toBeUndefined();
		expect(s.lastModel).toBeUndefined();
	});
});

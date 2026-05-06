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

	test('userMessageCount — skips isMeta messages', async () => {
		const s = await parse('session-meta-messages.jsonl');
		expect(s.userMessageCount).toBe(1); // "meta content" excluded, "real first prompt" counted
	});

	test('userMessageCount — skips isCompactSummary messages', async () => {
		const s = await parse('session-compact-summary.jsonl');
		expect(s.userMessageCount).toBe(1); // compact summary excluded
		expect(s.firstUserText).toBe('real user message');
	});

	test('userMessageCount — skips text block with empty string', async () => {
		const s = await parse('session-empty-text-block.jsonl');
		expect(s.userMessageCount).toBe(1); // text="" excluded, "real message" counted
	});

	test('lastModel — last non-synthetic assistant model', async () => {
		const s = await parse('session-synthetic-model.jsonl');
		expect(s.lastModel).toBe('claude-sonnet-4-6');
	});

	test('fast model — tokensByModel keyed as "<model>-fast"', async () => {
		const s = await parse('session-fast-model.jsonl');
		expect(s.tokensByModel['claude-opus-4-7-fast']).toBeDefined();
		expect(s.tokensByModel['claude-opus-4-7-fast']?.input).toBe(100);
		expect(s.tokensByModel['claude-opus-4-7']).toBeUndefined();
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

	test('dedup — tokens counted once after /resume replay', async () => {
		const s = await parse('session-resumed.jsonl');
		expect(s.tokens.input).toBe(10); // not 20
		expect(s.tokens.output).toBe(3); // not 6
	});

	test('dedup — assistantMessageCount counts unique API calls', async () => {
		const s = await parse('session-resumed.jsonl');
		expect(s.assistantMessageCount).toBe(1); // not 2
	});

	test('empty session — zero values', async () => {
		const s = await parse('does-not-exist.jsonl');
		expect(s.sessionId).toBeUndefined();
		expect(s.turns).toHaveLength(0);
		expect(s.durationMs).toBe(0);
		expect(s.firstUserText).toBeUndefined();
		expect(s.lastModel).toBeUndefined();
	});

	describe('analytics (session-analytics.jsonl)', () => {
		test('tokens — cumulative input/output/cache', async () => {
			const s = await parse('session-analytics.jsonl');
			expect(s.tokens.input).toBe(300); // 100 + 200
			expect(s.tokens.output).toBe(30); // 10 + 20
			expect(s.tokens.cacheRead).toBe(50); // first turn only
			expect(s.tokens.cacheCreation).toBe(20); // first turn only
		});

		test('tokensByModel — keyed by model', async () => {
			const s = await parse('session-analytics.jsonl');
			const model = s.tokensByModel['claude-sonnet-4-6'];
			expect(model).toBeDefined();
			expect(model?.input).toBe(300);
		});

		test('userMessageCount — excludes tool_result-only entries', async () => {
			const s = await parse('session-analytics.jsonl');
			expect(s.userMessageCount).toBe(1);
		});

		test('assistantMessageCount — counts both assistant turns', async () => {
			const s = await parse('session-analytics.jsonl');
			expect(s.assistantMessageCount).toBe(2);
		});

		test('toolUsage — Read deduplicated on tool_use.id', async () => {
			const s = await parse('session-analytics.jsonl');
			expect(s.toolUsage.Read).toBe(1); // tool_001 seen twice, counted once
			expect(s.toolUsage.Edit).toBe(1); // tool_003, new id
			expect(s.toolUsage.Skill).toBeUndefined(); // Skill goes to skillUsage
		});

		test('skillUsage — Skill tool routed by input.skill', async () => {
			const s = await parse('session-analytics.jsonl');
			expect(s.skillUsage.ultrareview).toBe(1);
		});

		test('primaryModel — most-used model', async () => {
			const s = await parse('session-analytics.jsonl');
			expect(s.primaryModel).toBe('claude-sonnet-4-6');
		});

		test('hourOfDay — human user messages bucketed by local hour (mirrors CC insights.ts)', async () => {
			const s = await parse('session-analytics.jsonl');
			// 1 human user message in the fixture → total must equal 1.
			const total = s.hourOfDay.reduce((acc, n) => acc + n, 0);
			expect(total).toBe(1);
			expect(s.hourOfDay).toHaveLength(24);
		});

		test('contextByTurn — one entry per assistant turn with tokens', async () => {
			const s = await parse('session-analytics.jsonl');
			expect(s.contextByTurn).toHaveLength(2);
			expect(s.contextByTurn[0]?.input).toBe(100);
			expect(s.contextByTurn[1]?.input).toBe(200);
		});

		test('lastContextTokens — fill of last assistant turn', async () => {
			const s = await parse('session-analytics.jsonl');
			// Last turn: input=200, cacheRead=0, cacheCreation=0 → fill=200
			expect(s.lastContextTokens).toBe(200);
		});
	});
});

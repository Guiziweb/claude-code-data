import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import {
	readSession,
	readSessionIds,
	readSessionTurns,
	readSubagents,
	readSubagentTurns,
} from '../../src/data/parser/session';
import { sumTokenBuckets } from '../../src/data/token-buckets';
import type { ParsedSubagent } from '../../src/data/types/parsed-session';

const PROJECT_DIR = join(import.meta.dir, '..', 'fixtures', 'synthetic', 'project-with-subagents');
const SESSION_ID = '00000000-0000-0000-0000-000000000aaa';

describe('readSessionIds()', () => {
	test('returns one ID per session file', async () => {
		const ids = await readSessionIds(PROJECT_DIR);
		expect(ids).toHaveLength(2);
	});

	test('returns the session UUIDs (filename without `.jsonl`)', async () => {
		const ids = (await readSessionIds(PROJECT_DIR)).slice().sort();
		expect(ids).toEqual([
			'00000000-0000-0000-0000-000000000aaa',
			'00000000-0000-0000-0000-000000000bbb',
		]);
	});

	test('excludes agent-*.jsonl (legacy subagent format)', async () => {
		const ids = await readSessionIds(PROJECT_DIR);
		expect(ids.some((id) => id.startsWith('agent-'))).toBe(false);
	});

	test('returns empty array for nonexistent directory', async () => {
		const ids = await readSessionIds(join(PROJECT_DIR, 'does-not-exist'));
		expect(ids).toEqual([]);
	});

	test('composes with readSession to walk every session in a project', async () => {
		const ids = await readSessionIds(PROJECT_DIR);
		const sessions = await Promise.all(ids.map((id) => readSession(PROJECT_DIR, id)));
		expect(sessions).toHaveLength(2);
		expect(sessions.every((s) => s.sessionId !== undefined)).toBe(true);
	});
});

describe('readSession()', () => {
	test('returns the session metadata', async () => {
		const s = await readSession(PROJECT_DIR, SESSION_ID);
		expect(s.sessionId).toBe(SESSION_ID);
	});

	test('exposes message counts on a real fixture', async () => {
		const s = await readSession(PROJECT_DIR, SESSION_ID);
		expect(s.userMessageCount).toBeGreaterThan(0);
		expect(s.assistantMessageCount).toBeGreaterThan(0);
	});

	test('empty session — returns a ParsedSession with undefined sessionId', async () => {
		const s = await readSession(PROJECT_DIR, 'does-not-exist');
		expect(s.sessionId).toBeUndefined();
		expect(s.userMessageCount).toBe(0);
		expect(s.assistantMessageCount).toBe(0);
	});
});

describe('readSessionTurns()', () => {
	test('yields the main user/assistant turns in order', async () => {
		const turns = [];
		for await (const turn of readSessionTurns(PROJECT_DIR, SESSION_ID)) {
			turns.push(turn);
		}
		expect(turns).toHaveLength(2);
		expect(turns[0]?.type).toBe('user');
		expect(turns[1]?.type).toBe('assistant');
	});

	test('skips subagent turns (isSidechain + agentId) from the main file', async () => {
		// The fixture's main file may contain sidechain entries — they must not surface here.
		const turns = [];
		for await (const turn of readSessionTurns(PROJECT_DIR, SESSION_ID)) {
			turns.push(turn);
		}
		expect(turns.every((t) => !(t.isSidechain && t.agentId !== undefined))).toBe(true);
	});

	test('empty session — yields nothing', async () => {
		const turns = [];
		for await (const turn of readSessionTurns(PROJECT_DIR, 'does-not-exist')) {
			turns.push(turn);
		}
		expect(turns).toHaveLength(0);
	});
});

describe('readSubagentTurns()', () => {
	test('yields subagent turns tagged with their agentId', async () => {
		const seen: Array<{ agentId: string; turnType: string }> = [];
		for await (const { agentId, turn } of readSubagentTurns(PROJECT_DIR, SESSION_ID)) {
			seen.push({ agentId, turnType: turn.type });
		}
		expect(seen.length).toBeGreaterThan(0);
		expect(seen.every((s) => typeof s.agentId === 'string' && s.agentId.length > 0)).toBe(true);
	});

	test('discovers subagents in nested layouts (workflows/<runId>/)', async () => {
		const agentIds = new Set<string>();
		for await (const { agentId } of readSubagentTurns(PROJECT_DIR, SESSION_ID)) {
			agentIds.add(agentId);
		}
		// The fixture has both flat (abc123) and nested (nested001) subagents.
		expect(agentIds.has('abc123')).toBe(true);
		expect(agentIds.has('nested001')).toBe(true);
	});

	test('groups by agentId — typical caller usage', async () => {
		const byAgent = new Map<string, number>();
		for await (const { agentId } of readSubagentTurns(PROJECT_DIR, SESSION_ID)) {
			byAgent.set(agentId, (byAgent.get(agentId) ?? 0) + 1);
		}
		expect(byAgent.get('abc123')).toBe(4);
		expect(byAgent.get('nested001')).toBe(1);
	});

	test('session without subagents — yields nothing', async () => {
		const seen = [];
		for await (const item of readSubagentTurns(PROJECT_DIR, 'does-not-exist')) {
			seen.push(item);
		}
		expect(seen).toHaveLength(0);
	});
});

describe('readSubagents()', () => {
	async function collect(sessionId: string): Promise<Map<string, ParsedSubagent>> {
		const byId = new Map<string, ParsedSubagent>();
		for await (const sub of readSubagents(PROJECT_DIR, sessionId)) byId.set(sub.agentId, sub);
		return byId;
	}

	test('yields one aggregate per subagent file, nested layouts included', async () => {
		const subs = await collect(SESSION_ID);
		expect([...subs.keys()].sort()).toEqual([
			'abc123',
			'nested001',
			'nested002',
			'nested003',
			'nested004',
			'nested005',
		]);
	});

	test('aggregates tokens and calls of the subagent transcript', async () => {
		const sub = (await collect(SESSION_ID)).get('abc123');
		expect(sub?.tokens).toEqual({ input: 5, output: 1, cacheRead: 0, cacheCreation: 0 });
		expect(sub?.assistantMessageCount).toBe(1);
		expect(sub?.primaryModel).toBe('claude-sonnet-4-6');
		expect(sub?.toolDenials).toEqual({ 'automode-blocked': 1 });
		expect(sub?.toolErrors).toEqual({ Bash: 1 });
		expect(sub?.fileEdits).toEqual({ '/p/sub.ts': 1 });
	});

	test('reads agent metadata from agent-<id>.meta.json', async () => {
		const sub = (await collect(SESSION_ID)).get('abc123');
		expect(sub?.agentType).toBe('Explore');
		expect(sub?.spawnDepth).toBe(1);
		expect(sub?.toolUseId).toBe('toolu_01');
		expect(sub?.description).toBe('Find the parser');
		expect(sub?.parentAgentId).toBeUndefined();
	});

	test('metadata fields undefined when meta.json is missing', async () => {
		const sub = (await collect(SESSION_ID)).get('nested002');
		expect(sub?.agentType).toBeUndefined();
		expect(sub?.spawnDepth).toBeUndefined();
	});

	test('exposes only subagent-relevant fields', async () => {
		const sub = (await collect(SESSION_ID)).get('abc123');
		expect(sub).not.toHaveProperty('cost');
		expect(sub).not.toHaveProperty('customTitle');
	});

	test('session without subagents — yields nothing', async () => {
		expect((await collect('does-not-exist')).size).toBe(0);
	});

	test('workflowRunId — set for agents under workflows/<runId>/, undefined otherwise', async () => {
		const subs = await collect(SESSION_ID);
		expect(subs.get('nested001')?.workflowRunId).toBe('wf_run-1');
		expect(subs.get('abc123')?.workflowRunId).toBeUndefined();
	});

	test('workflowStatus — last journal entry per agent', async () => {
		const subs = await collect(SESSION_ID);
		expect(subs.get('nested001')?.workflowStatus).toBe('done');
		expect(subs.get('nested002')?.workflowStatus).toBe('failed');
		expect(subs.get('nested003')?.workflowStatus).toBe('started');
		expect(subs.get('abc123')?.workflowStatus).toBeUndefined();
	});

	test('workflowStatus — unreadable journal does not stop the stream', async () => {
		// wf_run-3 has a directory named journal.jsonl: reading it fails with EISDIR.
		const subs = await collect(SESSION_ID);
		expect(subs.get('nested005')?.workflowRunId).toBe('wf_run-3');
		expect(subs.get('nested005')?.workflowStatus).toBeUndefined();
	});

	test('workflowStatus — undefined when the run has no journal', async () => {
		const sub = (await collect(SESSION_ID)).get('nested004');
		expect(sub?.workflowRunId).toBe('wf_run-2');
		expect(sub?.workflowStatus).toBeUndefined();
	});
});

describe('sumTokenBuckets()', () => {
	test('adds every bucket without mutating the inputs', () => {
		const a = { input: 1, output: 2, cacheRead: 3, cacheCreation: 4 };
		const b = { input: 10, output: 20, cacheRead: 30, cacheCreation: 40 };
		expect(sumTokenBuckets(a, b)).toEqual({
			input: 11,
			output: 22,
			cacheRead: 33,
			cacheCreation: 44,
		});
		expect(a).toEqual({ input: 1, output: 2, cacheRead: 3, cacheCreation: 4 });
	});

	test('no argument — empty buckets', () => {
		expect(sumTokenBuckets()).toEqual({ input: 0, output: 0, cacheRead: 0, cacheCreation: 0 });
	});
});

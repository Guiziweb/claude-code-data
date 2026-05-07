import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import {
	readSession,
	readSessionIds,
	readSessionTurns,
	readSubagentTurns,
} from '../../src/data/parser/session';

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
		expect(byAgent.get('abc123')).toBe(2);
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

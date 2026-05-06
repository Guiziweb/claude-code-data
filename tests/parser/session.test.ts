import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { parseSession } from '../../src/data/parser/session';

const PROJECT_DIR = join(import.meta.dir, '..', 'fixtures', 'synthetic', 'project-with-subagents');
const SESSION_ID = '00000000-0000-0000-0000-000000000aaa';

describe('parseSession()', () => {
	test('main transcript — 2 turns in order', async () => {
		const s = await parseSession(PROJECT_DIR, SESSION_ID);
		expect(s.sessionId).toBe(SESSION_ID);
		expect(s.turns).toHaveLength(2);
		expect(s.turns[0]?.type).toBe('user');
		expect(s.turns[1]?.type).toBe('assistant');
	});

	test('subagents from separate files (CC ≥ 2.1.2) — abc123 has 2 turns', async () => {
		const s = await parseSession(PROJECT_DIR, SESSION_ID);
		expect(s.subagentTurns.get('abc123')).toHaveLength(2);
	});

	test('nested subagent subdir (e.g. workflows/<runId>/)', async () => {
		const s = await parseSession(PROJECT_DIR, SESSION_ID);
		expect(s.subagentTurns.get('nested001')).toHaveLength(1);
	});

	test('total subagent count — 2 agents (abc123 + nested001)', async () => {
		const s = await parseSession(PROJECT_DIR, SESSION_ID);
		expect(s.subagentTurns.size).toBe(2);
	});

	test('empty session — returns empty ParsedSession', async () => {
		const s = await parseSession(PROJECT_DIR, 'does-not-exist');
		expect(s.turns).toHaveLength(0);
		expect(s.subagentTurns.size).toBe(0);
	});
});

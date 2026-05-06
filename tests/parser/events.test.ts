import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
	AgentNameEntry,
	AiTitleEntry,
	AssistantEntry,
	CustomTitleEntry,
	LastPromptEntry,
	PrLinkEntry,
	SessionEntry,
	UserEntry,
	WorktreeStateEntry,
} from '../../src/data/types/jsonl-events';
import { safeParseEntry, safeParseEntryFromLine } from '../../src/data/types/jsonl-events';

const FIXTURES = join(import.meta.dir, '..', 'fixtures', 'synthetic', 'events');

function loadJson(name: string): unknown {
	return JSON.parse(readFileSync(join(FIXTURES, name), 'utf8'));
}

function loadRaw(name: string): string {
	return readFileSync(join(FIXTURES, name), 'utf8').trimEnd();
}

describe('safeParseEntry() — individual event types', () => {
	test('user (TranscriptMessage)', () => {
		const result = safeParseEntry(loadJson('user.json')) as UserEntry;
		expect(result).not.toBeNull();
		expect(result.type).toBe('user');
	});

	test('assistant (TranscriptMessage)', () => {
		const result = safeParseEntry(loadJson('assistant.json')) as AssistantEntry;
		expect(result).not.toBeNull();
		expect(result.type).toBe('assistant');
	});

	test('custom-title', () => {
		const result = safeParseEntry(loadJson('custom-title.json')) as CustomTitleEntry;
		expect(result).not.toBeNull();
		expect(result.customTitle).toBe('Refactor auth');
	});

	test('ai-title', () => {
		const result = safeParseEntry(loadJson('ai-title.json')) as AiTitleEntry;
		expect(result).not.toBeNull();
		expect(result.aiTitle).toBe('Login refactor session');
	});

	test('last-prompt', () => {
		const result = safeParseEntry(loadJson('last-prompt.json')) as LastPromptEntry;
		expect(result).not.toBeNull();
		expect(result.lastPrompt).toBe('Continue the work');
	});

	test('last-prompt with leafUuid only (no lastPrompt) — real CC variant', () => {
		const result = safeParseEntry(loadJson('last-prompt-leafuuid.json')) as LastPromptEntry;
		expect(result).not.toBeNull();
		expect(result.lastPrompt).toBeUndefined();
		expect(result.leafUuid).toBe('18c5ab3d-11c8-43f8-97aa-f59727b186cd');
	});

	test('agent-name', () => {
		const result = safeParseEntry(loadJson('agent-name.json')) as AgentNameEntry;
		expect(result).not.toBeNull();
		expect(result.agentName).toBe('reviewer');
	});

	test('pr-link', () => {
		const result = safeParseEntry(loadJson('pr-link.json')) as PrLinkEntry;
		expect(result).not.toBeNull();
		expect(result.prNumber).toBe(123);
		expect(result.prUrl).toBe('https://github.com/owner/repo/pull/123');
		expect(result.prRepository).toBe('owner/repo');
	});

	test('worktree-state with session payload', () => {
		const result = safeParseEntry(loadJson('worktree-state.json')) as WorktreeStateEntry;
		expect(result).not.toBeNull();
		expect(result.worktreeSession?.worktreePath).toBe('/Users/test/project-wt-feat');
	});

	test('worktree-state on exit (null payload)', () => {
		const result = safeParseEntry(loadJson('worktree-state-exit.json')) as WorktreeStateEntry;
		expect(result).not.toBeNull();
		expect(result.worktreeSession).toBeNull();
	});
});

describe('safeParseEntry() — union', () => {
	test('accepts each known event type', () => {
		const files = [
			'user.json',
			'assistant.json',
			'custom-title.json',
			'ai-title.json',
			'last-prompt.json',
			'agent-name.json',
			'pr-link.json',
			'worktree-state.json',
		];
		for (const file of files) {
			const result: SessionEntry | null = safeParseEntry(loadJson(file));
			expect(result).not.toBeNull();
		}
	});

	test('returns null for unknown variant', () => {
		expect(safeParseEntry(loadJson('unknown-variant.json'))).toBeNull();
	});

	test('returns null for null', () => {
		expect(safeParseEntry(null)).toBeNull();
	});

	test('returns null for non-object', () => {
		expect(safeParseEntry('a string')).toBeNull();
	});
});

describe('safeParseEntryFromLine()', () => {
	test('returns parsed entry for a valid V0.1 line', () => {
		const result = safeParseEntryFromLine(loadRaw('custom-title.json'));
		expect(result).not.toBeNull();
		expect(result?.type).toBe('custom-title');
	});

	test('returns null for corrupted JSON', () => {
		expect(safeParseEntryFromLine(loadRaw('corrupted.txt'))).toBeNull();
	});

	test('returns null for empty string', () => {
		expect(safeParseEntryFromLine('')).toBeNull();
	});

	test('returns null for non-object JSON (e.g. string)', () => {
		expect(safeParseEntryFromLine('"a string"')).toBeNull();
	});
});

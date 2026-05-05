import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as v from 'valibot';
import {
	AgentNameMessageSchema,
	AiTitleMessageSchema,
	CustomTitleMessageSchema,
	EntryV01Schema,
	LastPromptMessageSchema,
	PRLinkMessageSchema,
	safeParseEntry,
	safeParseEntryFromLine,
	TranscriptMessageAssistantSchema,
	TranscriptMessageUserSchema,
	WorktreeStateEntrySchema,
} from '../../src/data/types/jsonl-events';

const FIXTURES = join(import.meta.dir, '..', 'fixtures', 'synthetic', 'events');

function loadJson(name: string): unknown {
	return JSON.parse(readFileSync(join(FIXTURES, name), 'utf8'));
}

function loadRaw(name: string): string {
	return readFileSync(join(FIXTURES, name), 'utf8').trimEnd();
}

describe('individual event schemas', () => {
	test('user (TranscriptMessage)', () => {
		const data = loadJson('user.json');
		expect(() => v.parse(TranscriptMessageUserSchema, data)).not.toThrow();
	});

	test('assistant (TranscriptMessage)', () => {
		const data = loadJson('assistant.json');
		expect(() => v.parse(TranscriptMessageAssistantSchema, data)).not.toThrow();
	});

	test('custom-title', () => {
		const data = loadJson('custom-title.json');
		const parsed = v.parse(CustomTitleMessageSchema, data);
		expect(parsed.customTitle).toBe('Refactor auth');
	});

	test('ai-title', () => {
		const data = loadJson('ai-title.json');
		const parsed = v.parse(AiTitleMessageSchema, data);
		expect(parsed.aiTitle).toBe('Login refactor session');
	});

	test('last-prompt', () => {
		const data = loadJson('last-prompt.json');
		const parsed = v.parse(LastPromptMessageSchema, data);
		expect(parsed.lastPrompt).toBe('Continue the work');
	});

	test('last-prompt with leafUuid only (no lastPrompt) — real CC variant', () => {
		const data = loadJson('last-prompt-leafuuid.json');
		const parsed = v.parse(LastPromptMessageSchema, data);
		expect(parsed.lastPrompt).toBeUndefined();
		expect(parsed.leafUuid).toBe('18c5ab3d-11c8-43f8-97aa-f59727b186cd');
	});

	test('agent-name', () => {
		const data = loadJson('agent-name.json');
		expect(v.parse(AgentNameMessageSchema, data).agentName).toBe('reviewer');
	});

	test('pr-link', () => {
		const data = loadJson('pr-link.json');
		const parsed = v.parse(PRLinkMessageSchema, data);
		expect(parsed.prNumber).toBe(123);
		expect(parsed.prUrl).toBe('https://github.com/owner/repo/pull/123');
		expect(parsed.prRepository).toBe('owner/repo');
	});

	test('worktree-state with session payload', () => {
		const data = loadJson('worktree-state.json');
		const parsed = v.parse(WorktreeStateEntrySchema, data);
		expect(parsed.worktreeSession?.worktreePath).toBe('/Users/test/project-wt-feat');
	});

	test('worktree-state on exit (null payload)', () => {
		const data = loadJson('worktree-state-exit.json');
		const parsed = v.parse(WorktreeStateEntrySchema, data);
		expect(parsed.worktreeSession).toBeNull();
	});
});

describe('EntryV01Schema (union)', () => {
	test('accepts each known event type', () => {
		const knownFiles = [
			'user.json',
			'assistant.json',
			'custom-title.json',
			'ai-title.json',
			'last-prompt.json',
			'agent-name.json',
			'pr-link.json',
			'worktree-state.json',
		];
		for (const file of knownFiles) {
			const data = loadJson(file);
			expect(() => v.parse(EntryV01Schema, data)).not.toThrow();
		}
	});

	test('rejects unknown variant', () => {
		const data = loadJson('unknown-variant.json');
		expect(() => v.parse(EntryV01Schema, data)).toThrow();
	});
});

describe('safeParseEntry()', () => {
	test('returns parsed entry for a valid V0.1 object', () => {
		const data = loadJson('custom-title.json');
		const result = safeParseEntry(data);
		expect(result).not.toBeNull();
		expect(result?.type).toBe('custom-title');
	});

	test('returns null for unknown variant (hors-V0.1)', () => {
		const data = loadJson('unknown-variant.json');
		expect(safeParseEntry(data)).toBeNull();
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
		const line = loadRaw('custom-title.json');
		const result = safeParseEntryFromLine(line);
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

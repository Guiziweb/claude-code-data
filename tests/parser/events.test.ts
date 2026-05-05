import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as v from 'valibot';
import {
	AgentColorMessageSchema,
	AgentNameMessageSchema,
	AgentSettingMessageSchema,
	AiTitleMessageSchema,
	CustomTitleMessageSchema,
	EntryV01Schema,
	LastPromptMessageSchema,
	ModeEntrySchema,
	PRLinkMessageSchema,
	SummaryMessageSchema,
	safeParseEntry,
	TagMessageSchema,
	TaskSummaryMessageSchema,
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

	test('summary', () => {
		const data = loadJson('summary.json');
		const parsed = v.parse(SummaryMessageSchema, data);
		expect(parsed.type).toBe('summary');
		expect(parsed.summary).toBe('User asked to refactor login flow.');
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

	test('task-summary', () => {
		const data = loadJson('task-summary.json');
		const parsed = v.parse(TaskSummaryMessageSchema, data);
		expect(parsed.summary).toBe('Investigating login bug');
		expect(parsed.timestamp).toBe('2026-05-05T10:05:00.000Z');
	});

	test('tag', () => {
		const data = loadJson('tag.json');
		expect(v.parse(TagMessageSchema, data).tag).toBe('auth');
	});

	test('agent-name', () => {
		const data = loadJson('agent-name.json');
		expect(v.parse(AgentNameMessageSchema, data).agentName).toBe('reviewer');
	});

	test('agent-color', () => {
		const data = loadJson('agent-color.json');
		expect(v.parse(AgentColorMessageSchema, data).agentColor).toBe('blue');
	});

	test('agent-setting', () => {
		const data = loadJson('agent-setting.json');
		expect(v.parse(AgentSettingMessageSchema, data).agentSetting).toBe('code-reviewer');
	});

	test('pr-link', () => {
		const data = loadJson('pr-link.json');
		const parsed = v.parse(PRLinkMessageSchema, data);
		expect(parsed.prNumber).toBe(123);
		expect(parsed.prUrl).toBe('https://github.com/owner/repo/pull/123');
		expect(parsed.prRepository).toBe('owner/repo');
	});

	test('mode coordinator', () => {
		const data = loadJson('mode.json');
		expect(v.parse(ModeEntrySchema, data).mode).toBe('coordinator');
	});

	test('mode rejects unknown value', () => {
		expect(() =>
			v.parse(ModeEntrySchema, {
				type: 'mode',
				sessionId: '00000000-0000-0000-0000-000000000aaa',
				mode: 'invalid',
			})
		).toThrow();
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
			'summary.json',
			'custom-title.json',
			'ai-title.json',
			'last-prompt.json',
			'task-summary.json',
			'tag.json',
			'agent-name.json',
			'agent-color.json',
			'agent-setting.json',
			'pr-link.json',
			'mode.json',
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
	test('returns parsed entry for valid V0.1 line', () => {
		const line = loadRaw('summary.json');
		const result = safeParseEntry(line);
		expect(result).not.toBeNull();
		expect(result?.type).toBe('summary');
	});

	test('returns null for unknown variant (hors-V0.1)', () => {
		const line = loadRaw('unknown-variant.json');
		const result = safeParseEntry(line);
		expect(result).toBeNull();
	});

	test('returns null for corrupted JSON', () => {
		const line = loadRaw('corrupted.txt');
		const result = safeParseEntry(line);
		expect(result).toBeNull();
	});

	test('returns null for empty string', () => {
		expect(safeParseEntry('')).toBeNull();
	});

	test('returns null for non-object JSON (e.g. string)', () => {
		expect(safeParseEntry('"a string"')).toBeNull();
	});
});

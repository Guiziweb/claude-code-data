import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
	ContentBlock,
	DocumentBlock,
	ImageBlock,
	RedactedThinkingBlock,
	TextBlock,
	ThinkingBlock,
	ToolResultBlock,
	ToolUseBlock,
} from '../../src/data/types/content-blocks';
import { safeParseContentBlock } from '../../src/data/types/content-blocks';

const FIXTURES = join(import.meta.dir, '..', 'fixtures', 'synthetic', 'content-blocks');

function loadJson(name: string): unknown {
	return JSON.parse(readFileSync(join(FIXTURES, name), 'utf8'));
}

describe('safeParseContentBlock() — individual variants', () => {
	test('text', () => {
		const result = safeParseContentBlock(loadJson('text.json')) as TextBlock;
		expect(result).not.toBeNull();
		expect(result.text).toBe('Hello world');
	});

	test('thinking', () => {
		const result = safeParseContentBlock(loadJson('thinking.json')) as ThinkingBlock;
		expect(result).not.toBeNull();
		expect(result.thinking).toBe('Let me think about this...');
		expect(result.signature).toBe('ErsCClsIDRgCKkAB3w==');
	});

	test('redacted_thinking', () => {
		const result = safeParseContentBlock(
			loadJson('redacted-thinking.json')
		) as RedactedThinkingBlock;
		expect(result).not.toBeNull();
		expect(result.data).toBe('ErsCClsIDRgCKkAB3w==');
	});

	test('tool_use', () => {
		const result = safeParseContentBlock(loadJson('tool-use.json')) as ToolUseBlock;
		expect(result).not.toBeNull();
		expect(result.id).toBe('toolu_01YKQ6N9Qg1MGu3dBvpqztFB');
		expect(result.name).toBe('Bash');
	});

	test('tool_result', () => {
		const result = safeParseContentBlock(loadJson('tool-result.json')) as ToolResultBlock;
		expect(result).not.toBeNull();
		expect(result.tool_use_id).toBe('toolu_01YKQ6N9Qg1MGu3dBvpqztFB');
		expect(result.is_error).toBe(false);
	});

	test('image', () => {
		const result = safeParseContentBlock(loadJson('image.json')) as ImageBlock;
		expect(result).not.toBeNull();
		expect(result.type).toBe('image');
	});

	test('document', () => {
		const result = safeParseContentBlock(loadJson('document.json')) as DocumentBlock;
		expect(result).not.toBeNull();
		expect(result.type).toBe('document');
	});
});

describe('safeParseContentBlock() — union', () => {
	test('accepts each known variant', () => {
		const files = [
			'text.json',
			'thinking.json',
			'redacted-thinking.json',
			'tool-use.json',
			'tool-result.json',
			'image.json',
			'document.json',
		];
		for (const file of files) {
			const result: ContentBlock | null = safeParseContentBlock(loadJson(file));
			expect(result).not.toBeNull();
		}
	});

	test('returns null for unknown variant', () => {
		expect(safeParseContentBlock(loadJson('unknown-block.json'))).toBeNull();
	});

	test('returns null for null', () => {
		expect(safeParseContentBlock(null)).toBeNull();
	});

	test('returns null for non-object', () => {
		expect(safeParseContentBlock('string')).toBeNull();
	});
});

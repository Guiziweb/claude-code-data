import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as v from 'valibot';
import {
	ContentBlockSchema,
	DocumentBlockSchema,
	ImageBlockSchema,
	RedactedThinkingBlockSchema,
	safeParseContentBlock,
	TextBlockSchema,
	ThinkingBlockSchema,
	ToolResultBlockSchema,
	ToolUseBlockSchema,
} from '../../src/data/types/content-blocks';

const FIXTURES = join(import.meta.dir, '..', 'fixtures', 'synthetic', 'content-blocks');

function loadJson(name: string): unknown {
	return JSON.parse(readFileSync(join(FIXTURES, name), 'utf8'));
}

describe('individual content block schemas', () => {
	test('text', () => {
		const data = loadJson('text.json');
		const parsed = v.parse(TextBlockSchema, data);
		expect(parsed.text).toBe('Hello world');
	});

	test('thinking', () => {
		const data = loadJson('thinking.json');
		const parsed = v.parse(ThinkingBlockSchema, data);
		expect(parsed.thinking).toBe('Let me think about this...');
		expect(parsed.signature).toBe('ErsCClsIDRgCKkAB3w==');
	});

	test('redacted_thinking', () => {
		const data = loadJson('redacted-thinking.json');
		const parsed = v.parse(RedactedThinkingBlockSchema, data);
		expect(parsed.data).toBe('ErsCClsIDRgCKkAB3w==');
	});

	test('tool_use', () => {
		const data = loadJson('tool-use.json');
		const parsed = v.parse(ToolUseBlockSchema, data);
		expect(parsed.id).toBe('toolu_01YKQ6N9Qg1MGu3dBvpqztFB');
		expect(parsed.name).toBe('Bash');
	});

	test('tool_result', () => {
		const data = loadJson('tool-result.json');
		const parsed = v.parse(ToolResultBlockSchema, data);
		expect(parsed.tool_use_id).toBe('toolu_01YKQ6N9Qg1MGu3dBvpqztFB');
		expect(parsed.is_error).toBe(false);
	});

	test('image', () => {
		const data = loadJson('image.json');
		const parsed = v.parse(ImageBlockSchema, data);
		expect(parsed.type).toBe('image');
	});

	test('document', () => {
		const data = loadJson('document.json');
		const parsed = v.parse(DocumentBlockSchema, data);
		expect(parsed.type).toBe('document');
	});
});

describe('ContentBlockSchema (union)', () => {
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
			const data = loadJson(file);
			expect(() => v.parse(ContentBlockSchema, data)).not.toThrow();
		}
	});

	test('rejects unknown variant', () => {
		const data = loadJson('unknown-block.json');
		expect(() => v.parse(ContentBlockSchema, data)).toThrow();
	});
});

describe('safeParseContentBlock()', () => {
	test('returns parsed block for valid variant', () => {
		const data = loadJson('text.json');
		const result = safeParseContentBlock(data);
		expect(result).not.toBeNull();
		expect(result?.type).toBe('text');
	});

	test('returns null for unknown variant', () => {
		const data = loadJson('unknown-block.json');
		expect(safeParseContentBlock(data)).toBeNull();
	});

	test('returns null for null', () => {
		expect(safeParseContentBlock(null)).toBeNull();
	});

	test('returns null for non-object', () => {
		expect(safeParseContentBlock('string')).toBeNull();
	});
});

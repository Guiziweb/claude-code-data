import * as v from 'valibot';

// V0.1 ContentBlock schemas — verified against real ~/.claude/ data.
// Schemas use `looseObject` to tolerate undocumented fields (e.g. `caller` on tool_use).
//
// Not shipped (not observable in CC JSONL):
//   server_tool_use / web_search_tool_result — consumed internally by WebSearchTool, never written to transcript
//   mcp_tool_use — API-beta, no real data observed

export const TextBlockSchema = v.looseObject({
	type: v.literal('text'),
	text: v.string(),
});

export const ThinkingBlockSchema = v.looseObject({
	type: v.literal('thinking'),
	thinking: v.string(),
	signature: v.optional(v.string()),
});

export const RedactedThinkingBlockSchema = v.looseObject({
	type: v.literal('redacted_thinking'),
	data: v.string(),
});

export const ToolUseBlockSchema = v.looseObject({
	type: v.literal('tool_use'),
	id: v.string(),
	name: v.string(),
	input: v.looseObject({}),
});

export const ToolResultBlockSchema = v.looseObject({
	type: v.literal('tool_result'),
	tool_use_id: v.string(),
	content: v.unknown(),
	is_error: v.optional(v.boolean()),
});

export const ImageBlockSchema = v.looseObject({
	type: v.literal('image'),
	source: v.looseObject({}),
});

export const DocumentBlockSchema = v.looseObject({
	type: v.literal('document'),
	source: v.looseObject({}),
});

export const ContentBlockSchema = v.variant('type', [
	TextBlockSchema,
	ThinkingBlockSchema,
	RedactedThinkingBlockSchema,
	ToolUseBlockSchema,
	ToolResultBlockSchema,
	ImageBlockSchema,
	DocumentBlockSchema,
]);

export type ContentBlock = v.InferOutput<typeof ContentBlockSchema>;

export function safeParseContentBlock(value: unknown): ContentBlock | null {
	if (value === null || typeof value !== 'object') return null;
	const result = v.safeParse(ContentBlockSchema, value);
	return result.success ? result.output : null;
}

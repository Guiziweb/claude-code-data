import * as v from 'valibot';

// ---------------------------------------------------------------------------
// Explicit public types — TypeDoc reads these, not the Valibot schemas.
// looseObject schemas tolerate undocumented fields (e.g. `caller` on tool_use);
// the explicit types document only the fields CC reliably emits.
// ---------------------------------------------------------------------------

/** Plain text content from a user or assistant message. */
export type TextBlock = { type: 'text'; text: string };

/** Extended thinking content produced by Claude before responding. */
export type ThinkingBlock = { type: 'thinking'; thinking: string; signature?: string };

/** Redacted thinking block — content replaced by an opaque token. */
export type RedactedThinkingBlock = { type: 'redacted_thinking'; data: string };

/** A tool call issued by Claude. `input` contains the tool-specific arguments. */
export type ToolUseBlock = {
	type: 'tool_use';
	id: string;
	name: string;
	input: Record<string, unknown>;
};

/** The result returned to Claude after a tool call. */
export type ToolResultBlock = {
	type: 'tool_result';
	tool_use_id: string;
	content: unknown;
	is_error?: boolean;
};

/** An image attachment (source format depends on provider). */
export type ImageBlock = { type: 'image'; source: Record<string, unknown> };

/** A document attachment (PDF, text file, etc.). */
export type DocumentBlock = { type: 'document'; source: Record<string, unknown> };

/**
 * Union of all content block variants found in Claude Code session transcripts.
 *
 * Verified against real `~/.claude/` data. Variants not observable in CC JSONL
 * (`server_tool_use`, `web_search_tool_result`, `mcp_tool_use`) are excluded.
 */
export type ContentBlock =
	| TextBlock
	| ThinkingBlock
	| RedactedThinkingBlock
	| ToolUseBlock
	| ToolResultBlock
	| ImageBlock
	| DocumentBlock;

// ---------------------------------------------------------------------------
// Valibot schemas — internal, used only by safeParseContentBlock.
// looseObject tolerates extra fields written by CC but not in the public type.
// ---------------------------------------------------------------------------

const TextBlockSchema = v.looseObject({ type: v.literal('text'), text: v.string() });
const ThinkingBlockSchema = v.looseObject({
	type: v.literal('thinking'),
	thinking: v.string(),
	signature: v.optional(v.string()),
});
const RedactedThinkingBlockSchema = v.looseObject({
	type: v.literal('redacted_thinking'),
	data: v.string(),
});
const ToolUseBlockSchema = v.looseObject({
	type: v.literal('tool_use'),
	id: v.string(),
	name: v.string(),
	input: v.looseObject({}),
});
const ToolResultBlockSchema = v.looseObject({
	type: v.literal('tool_result'),
	tool_use_id: v.string(),
	content: v.unknown(),
	is_error: v.optional(v.boolean()),
});
const ImageBlockSchema = v.looseObject({ type: v.literal('image'), source: v.looseObject({}) });
const DocumentBlockSchema = v.looseObject({
	type: v.literal('document'),
	source: v.looseObject({}),
});

const ContentBlockSchema = v.variant('type', [
	TextBlockSchema,
	ThinkingBlockSchema,
	RedactedThinkingBlockSchema,
	ToolUseBlockSchema,
	ToolResultBlockSchema,
	ImageBlockSchema,
	DocumentBlockSchema,
]);

/** Parses an unknown value as a {@link ContentBlock}. Returns `null` for unrecognised shapes. */
export function safeParseContentBlock(value: unknown): ContentBlock | null {
	if (value === null || typeof value !== 'object') return null;
	const result = v.safeParse(ContentBlockSchema, value);
	return result.success ? (result.output as ContentBlock) : null;
}

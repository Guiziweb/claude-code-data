import * as v from 'valibot';

// ---------------------------------------------------------------------------
// Explicit public types — TypeDoc reads these, not the Valibot schemas.
// ---------------------------------------------------------------------------

/** A user turn in the session transcript. */
export type UserEntry = {
	type: 'user';
	uuid: string;
	parentUuid: string | null;
	isSidechain: boolean;
	sessionId: string;
	timestamp: string;
	version: string;
	cwd: string;
	userType: string;
	/** Raw message payload. Use helpers from `message-helpers` to access typed sub-fields. */
	message: Record<string, unknown>;
	entrypoint?: string;
	gitBranch?: string;
	slug?: string;
	logicalParentUuid?: string | null;
	agentId?: string;
	teamName?: string;
	agentName?: string;
	agentColor?: string;
	promptId?: string;
	/** Tool-result-only user messages are marked `isMeta: true` by CC. */
	isMeta?: boolean;
	/** Compact summary injected by CC's auto-compact are marked `isCompactSummary: true`. */
	isCompactSummary?: boolean;
	/** Used to deduplicate assistant entries replayed after `/resume`. */
	requestId?: string;
};

/** An assistant turn in the session transcript. */
export type AssistantEntry = {
	type: 'assistant';
	uuid: string;
	parentUuid: string | null;
	isSidechain: boolean;
	sessionId: string;
	timestamp: string;
	version: string;
	cwd: string;
	userType: string;
	/** Raw message payload. Use helpers from `message-helpers` to access typed sub-fields. */
	message: Record<string, unknown>;
	entrypoint?: string;
	gitBranch?: string;
	slug?: string;
	logicalParentUuid?: string | null;
	agentId?: string;
	teamName?: string;
	agentName?: string;
	agentColor?: string;
	promptId?: string;
	isMeta?: boolean;
	isCompactSummary?: boolean;
	requestId?: string;
};

/** User-defined session title written by CC when `/title` is used. */
export type CustomTitleEntry = {
	type: 'custom-title';
	sessionId: string;
	customTitle: string;
};

/** AI-generated session title written by CC at the end of a session. */
export type AiTitleEntry = {
	type: 'ai-title';
	sessionId: string;
	aiTitle: string;
};

/** Last user prompt captured by CC for the session resume UI. */
export type LastPromptEntry = {
	type: 'last-prompt';
	sessionId: string;
	lastPrompt?: string;
	leafUuid?: string;
};

/** Custom agent name when the session runs as a named subagent. */
export type AgentNameEntry = {
	type: 'agent-name';
	sessionId: string;
	agentName: string;
};

/** GitHub PR linked to this session via `pr-link` event. */
export type PrLinkEntry = {
	type: 'pr-link';
	sessionId: string;
	prNumber: number;
	prUrl: string;
	prRepository: string;
	timestamp: string;
};

/** Worktree metadata written when entering or exiting a `claude --worktree` session. */
export type WorktreeStateEntry = {
	type: 'worktree-state';
	sessionId: string;
	/** `null` means the worktree was exited. */
	worktreeSession: {
		originalCwd: string;
		worktreePath: string;
		worktreeName: string;
		worktreeBranch?: string;
		originalBranch?: string;
		originalHeadCommit?: string;
		sessionId: string;
		tmuxSessionName?: string;
		hookBased?: boolean;
	} | null;
};

/**
 * Union of all JSONL entry variants parsed from a Claude Code session file.
 *
 * Covers the 8 event types reliably emitted by public CC builds (verified on
 * real `~/.claude/` data). Entries with unknown `type` are silently skipped
 * by {@link parseJsonlStream}.
 */
export type SessionEntry =
	| UserEntry
	| AssistantEntry
	| CustomTitleEntry
	| AiTitleEntry
	| LastPromptEntry
	| AgentNameEntry
	| PrLinkEntry
	| WorktreeStateEntry;

// ---------------------------------------------------------------------------
// Valibot schemas — internal, used only by safeParseEntry / safeParseEntryFromLine.
// ---------------------------------------------------------------------------

const Uuid = v.pipe(v.string(), v.uuid());

const TranscriptMessageBaseSchema = {
	uuid: Uuid,
	parentUuid: v.nullable(Uuid),
	isSidechain: v.boolean(),
	sessionId: Uuid,
	timestamp: v.string(),
	version: v.string(),
	cwd: v.string(),
	userType: v.string(),
	message: v.looseObject({}),
	entrypoint: v.optional(v.string()),
	gitBranch: v.optional(v.string()),
	slug: v.optional(v.string()),
	logicalParentUuid: v.optional(v.nullable(Uuid)),
	agentId: v.optional(v.string()),
	teamName: v.optional(v.string()),
	agentName: v.optional(v.string()),
	agentColor: v.optional(v.string()),
	promptId: v.optional(v.string()),
	isMeta: v.optional(v.boolean()),
	isCompactSummary: v.optional(v.boolean()),
	requestId: v.optional(v.string()),
};

const TranscriptMessageUserSchema = v.looseObject({
	type: v.literal('user'),
	...TranscriptMessageBaseSchema,
});

const TranscriptMessageAssistantSchema = v.looseObject({
	type: v.literal('assistant'),
	...TranscriptMessageBaseSchema,
});

const CustomTitleMessageSchema = v.looseObject({
	type: v.literal('custom-title'),
	sessionId: Uuid,
	customTitle: v.string(),
});

const AiTitleMessageSchema = v.looseObject({
	type: v.literal('ai-title'),
	sessionId: Uuid,
	aiTitle: v.string(),
});

const LastPromptMessageSchema = v.looseObject({
	type: v.literal('last-prompt'),
	sessionId: Uuid,
	lastPrompt: v.optional(v.string()),
	leafUuid: v.optional(Uuid),
});

const AgentNameMessageSchema = v.looseObject({
	type: v.literal('agent-name'),
	sessionId: Uuid,
	agentName: v.string(),
});

const PRLinkMessageSchema = v.looseObject({
	type: v.literal('pr-link'),
	sessionId: Uuid,
	prNumber: v.number(),
	prUrl: v.string(),
	prRepository: v.string(),
	timestamp: v.string(),
});

const PersistedWorktreeSessionSchema = v.looseObject({
	originalCwd: v.string(),
	worktreePath: v.string(),
	worktreeName: v.string(),
	worktreeBranch: v.optional(v.string()),
	originalBranch: v.optional(v.string()),
	originalHeadCommit: v.optional(v.string()),
	sessionId: Uuid,
	tmuxSessionName: v.optional(v.string()),
	hookBased: v.optional(v.boolean()),
});

const WorktreeStateEntrySchema = v.looseObject({
	type: v.literal('worktree-state'),
	sessionId: Uuid,
	worktreeSession: v.nullable(PersistedWorktreeSessionSchema),
});

const SessionEntrySchema = v.variant('type', [
	TranscriptMessageUserSchema,
	TranscriptMessageAssistantSchema,
	CustomTitleMessageSchema,
	AiTitleMessageSchema,
	LastPromptMessageSchema,
	AgentNameMessageSchema,
	PRLinkMessageSchema,
	WorktreeStateEntrySchema,
]);

/** Parses an unknown value as a {@link SessionEntry}. Returns `null` for unrecognised shapes. */
export function safeParseEntry(value: unknown): SessionEntry | null {
	if (value === null || typeof value !== 'object') return null;
	const result = v.safeParse(SessionEntrySchema, value);
	return result.success ? (result.output as SessionEntry) : null;
}

/** Parses a raw JSONL line as a {@link SessionEntry}. Returns `null` for invalid JSON or unrecognised shapes. */
export function safeParseEntryFromLine(line: string): SessionEntry | null {
	if (line.length === 0) return null;
	let parsed: unknown;
	try {
		parsed = JSON.parse(line);
	} catch {
		return null;
	}
	return safeParseEntry(parsed);
}

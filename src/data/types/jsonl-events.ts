import * as v from 'valibot';

// ---------------------------------------------------------------------------
// Explicit public types — TypeDoc reads these, not the Valibot schemas.
// ---------------------------------------------------------------------------

/** A user turn in the session transcript. */
export type UserEntry = {
	type: 'user';
	uuid: string;
	parentUuid: string | null;
	/**
	 * `true` when this entry belongs to a subagent's transcript rather than the main session.
	 * CC writes subagent turns to a separate file (`subagents/agent-<id>.jsonl`) and marks them
	 * `isSidechain: true`. Use `agentId` to identify which subagent this turn belongs to.
	 */
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
	/**
	 * Why a tool call was refused, on the `tool_result` entry that reports the refusal.
	 * Observed values: `'user-rejected'`, `'automode-blocked'`, `'permission-rule'`,
	 * `'automode-unavailable'`, `'interrupted'`. Not exhaustive.
	 */
	toolDenialKind?: string;
	/**
	 * Structured output of the tool call answered by this entry. Its shape depends on the tool
	 * (e.g. `stdout`/`stderr` for Bash, `runId`/`workflowName` for Workflow) — narrow before use.
	 */
	toolUseResult?: unknown;
};

/** An assistant turn in the session transcript. */
export type AssistantEntry = {
	type: 'assistant';
	uuid: string;
	parentUuid: string | null;
	/** See {@link UserEntry.isSidechain}. */
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
	/** Effort level of the API call. Observed values: `'medium'`, `'high'`, `'xhigh'`. */
	effort?: string;
	/** Skill whose execution triggered this API call. */
	attributionSkill?: string;
	/** MCP server whose tool call (or tool result) triggered this API call. */
	attributionMcpServer?: string;
	/** MCP tool name paired with {@link AssistantEntry.attributionMcpServer}. */
	attributionMcpTool?: string;
	/** Plugin that provided the skill or tool behind this API call. */
	attributionPlugin?: string;
	/** Subagent type behind this API call. Only present in subagent transcripts. */
	attributionAgent?: string;
	/**
	 * `true` when CC wrote this entry to report an API failure instead of a model response.
	 * The message model is `'<synthetic>'` and its text explains the error.
	 */
	isApiErrorMessage?: boolean;
	/** Error category on API error entries. Observed values: `'rate_limit'`, `'authentication_failed'`, `'server_error'`. */
	error?: string;
	/** HTTP status of the failed API call (e.g. `429`). */
	apiErrorStatus?: number;
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

/**
 * Last user prompt captured by CC for the session resume UI.
 * `lastPrompt` is optional — CC also emits a `leaf-uuid-only` variant
 * (`{ type, sessionId, leafUuid }`) without `lastPrompt` (observed in real sessions).
 * `leafUuid` is an observed extension not present in the CC public type definition.
 */
export type LastPromptEntry = {
	type: 'last-prompt';
	sessionId: string;
	lastPrompt?: string;
	leafUuid?: string;
};

/** Custom agent name set via `/rename` or swarm configuration. */
export type AgentNameEntry = {
	type: 'agent-name';
	sessionId: string;
	agentName: string;
};

/** Display color for the agent in the terminal (cosmetic). */
export type AgentColorEntry = {
	type: 'agent-color';
	sessionId: string;
	agentColor: string;
};

/**
 * Agent preset name used for this session — from the `--agent` CLI flag or `settings.agent`.
 * Displayed as `@<agentSetting>` in the Claude Code session list.
 */
export type AgentSettingEntry = {
	type: 'agent-setting';
	sessionId: string;
	agentSetting: string;
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

/**
 * Session mode written by CC when running in multi-agent coordinator mode.
 * `'coordinator'` = orchestrating subagents, `'normal'` = standard session.
 */
export type ModeEntry = {
	type: 'mode';
	sessionId: string;
	mode: 'coordinator' | 'normal';
};

/**
 * Permission level active for the session.
 * Not in the CC public `Entry` union but emitted on every session.
 * Observed values: `'default'`, `'acceptEdits'`, `'plan'`.
 */
export type PermissionModeEntry = {
	type: 'permission-mode';
	sessionId: string;
	permissionMode: string;
};

/** User-defined tag label attached to the session. */
export type TagEntry = {
	type: 'tag';
	sessionId: string;
	tag: string;
};

/**
 * Auto-compact summary injected into the transcript when CC compresses the context.
 * `leafUuid` is the UUID of the last message in the session at the time of compaction —
 * CC uses it as a key to look up and splice the summary at the correct position on `/resume`.
 */
export type SummaryEntry = {
	type: 'summary';
	leafUuid: string;
	summary: string;
};

/**
 * Periodic fork-generated summary of what the agent is doing.
 * Written every min(5 steps, 2 min) so `claude ps` can show useful status.
 */
export type TaskSummaryEntry = {
	type: 'task-summary';
	sessionId: string;
	summary: string;
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
 * Cost counters of one CC process run, written when the process exits.
 *
 * Counters are cumulative within a run and reset when the session is resumed in a new
 * process — `startTime` identifies the run. A session with several runs carries one
 * entry per run (sometimes repeated with identical values).
 * Not emitted by every entrypoint: SDK sessions often have none.
 */
export type CostStateEntry = {
	type: 'cost-state';
	sessionId: string;
	/** Run start, in epoch milliseconds. */
	startTime: number;
	/** Cost of the run in USD, as computed by CC (includes background calls absent from the transcript). */
	totalCostUSD: number;
	/** `0` when absent or invalid — only `startTime` and `totalCostUSD` are required. */
	totalLinesAdded: number;
	/** `0` when absent or invalid. */
	totalLinesRemoved: number;
	/** Time spent executing tools, in milliseconds. `0` when absent or invalid. */
	totalToolDuration: number;
	/** Per-model breakdown. `{}` when absent or invalid. Keys are CC model ids, possibly suffixed (e.g. `claude-opus-5-5[1m]`). */
	modelUsage: Record<string, { costUSD?: number; [key: string]: unknown }>;
	/** `true` when CC had no price for at least one model — `totalCostUSD` is then underestimated. */
	hasUnknownModelCost?: boolean;
	[key: string]: unknown;
};

/** Written when CC moves the session to another working directory (e.g. into a worktree). */
export type RelocatedEntry = {
	type: 'relocated';
	sessionId: string;
	relocatedCwd: string;
};

/**
 * System message injected into the transcript (e.g. turn duration, CLAUDE.md content).
 * Not in the CC public `Entry` union. `subtype` discriminates the variant.
 */
export type SystemEntry = {
	type: 'system';
	subtype?: string;
	uuid?: string;
	sessionId?: string;
	timestamp?: string;
	/** API duration in milliseconds — present on `subtype: 'turn_duration'` entries. */
	durationMs?: number;
	[key: string]: unknown;
};

/**
 * Hook output or file attachment injected into the context.
 * Not in the CC public `Entry` union.
 */
export type AttachmentEntry = {
	type: 'attachment';
	uuid: string;
	parentUuid: string | null;
	isSidechain: boolean;
	sessionId: string;
	timestamp: string;
	attachment: Record<string, unknown>;
	[key: string]: unknown;
};

/**
 * Snapshot of open file versions for restore after `/resume`.
 * The `snapshot` payload can be large (contains file content backups).
 */
export type FileHistorySnapshotEntry = {
	type: 'file-history-snapshot';
	messageId: string;
	snapshot: Record<string, unknown>;
	isSnapshotUpdate: boolean;
};

/**
 * Per-file attribution state tracking Claude's character contributions.
 * Last-wins — each entry is a full state snapshot (never summed across entries).
 *
 * **Note**: gated behind CC's internal `COMMIT_ATTRIBUTION` feature flag —
 * not emitted by public CC builds.
 */
export type AttributionSnapshotEntry = {
	type: 'attribution-snapshot';
	messageId: string;
	surface: string;
	fileStates: Record<
		string,
		{
			contentHash: string;
			claudeContribution: number;
			mtime: number;
		}
	>;
	promptCount?: number;
	promptCountAtLastCommit?: number;
	permissionPromptCount?: number;
	permissionPromptCountAtLastCommit?: number;
	escapeCount?: number;
	escapeCountAtLastCommit?: number;
};

/**
 * Context-collapse commit written by CC's internal context-compression system
 * (code-named "marble-origami"). When the context window fills up, CC archives
 * a span of old messages and replaces them with a compact summary placeholder.
 * This entry records the boundaries of the archived span so it can be restored on `/resume`.
 *
 * **Note**: gated behind CC's internal `CONTEXT_COLLAPSE` feature flag —
 * not emitted by public CC builds.
 */
export type ContextCollapseCommitEntry = {
	type: 'marble-origami-commit';
	sessionId: string;
	collapseId: string;
	summaryUuid: string;
	summaryContent: string;
	summary: string;
	firstArchivedUuid: string;
	lastArchivedUuid: string;
};

/**
 * Snapshot of the staged context-collapse queue (see {@link ContextCollapseCommitEntry}).
 * Last-wins — only the most recent snapshot is applied on `/resume`.
 */
export type ContextCollapseSnapshotEntry = {
	type: 'marble-origami-snapshot';
	sessionId: string;
	staged: Array<{
		startUuid: string;
		endUuid: string;
		summary: string;
		risk: number;
		stagedAt: number;
	}>;
	armed: boolean;
	lastSpawnTokens: number;
};

/** Content blocks replaced with smaller stubs for prompt cache stability on `/resume`. */
export type ContentReplacementEntry = {
	type: 'content-replacement';
	sessionId: string;
	agentId?: string;
	[key: string]: unknown;
};

/** Internal write-queue operation (enqueue/dequeue). No user-facing value. */
export type QueueOperationEntry = {
	type: 'queue-operation';
	operation: string;
	sessionId?: string;
	timestamp?: string;
	[key: string]: unknown;
};

/**
 * Speculative pre-computation accepted by the user.
 * `timeSavedMs` = estimated latency saved by the speculation.
 */
export type SpeculationAcceptEntry = {
	type: 'speculation-accept';
	timestamp: string;
	timeSavedMs: number;
};

/**
 * Union of all JSONL entry variants emitted by Claude Code.
 *
 * Covers every event type found in the CC source (`types/logs.ts`) plus
 * undocumented events observed in real `~/.claude/` data (`permission-mode`,
 * `system`, `attachment`). Entries with unknown `type` are silently skipped
 * by {@link parseJsonlStream}.
 *
 * Use {@link parseJsonlStream} + a `switch (entry.type)` to process specific events.
 */
export type SessionEntry =
	| UserEntry
	| AssistantEntry
	| CustomTitleEntry
	| AiTitleEntry
	| LastPromptEntry
	| AgentNameEntry
	| AgentColorEntry
	| AgentSettingEntry
	| PrLinkEntry
	| ModeEntry
	| PermissionModeEntry
	| TagEntry
	| SummaryEntry
	| TaskSummaryEntry
	| WorktreeStateEntry
	| CostStateEntry
	| RelocatedEntry
	| SystemEntry
	| AttachmentEntry
	| FileHistorySnapshotEntry
	| AttributionSnapshotEntry
	| ContextCollapseCommitEntry
	| ContextCollapseSnapshotEntry
	| ContentReplacementEntry
	| QueueOperationEntry
	| SpeculationAcceptEntry;

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

// Analytics-only fields: a shape change from CC must not drop the whole message,
// so an invalid value falls back to `undefined` instead of failing the entry.
const lenientString = v.fallback(v.optional(v.string()), undefined);
const lenientNumber = v.fallback(v.optional(v.number()), undefined);
const lenientBoolean = v.fallback(v.optional(v.boolean()), undefined);
const lenientCounter = v.fallback(v.number(), 0);

const TranscriptMessageUserSchema = v.looseObject({
	type: v.literal('user'),
	...TranscriptMessageBaseSchema,
	toolDenialKind: lenientString,
	toolUseResult: v.optional(v.unknown()),
});

const TranscriptMessageAssistantSchema = v.looseObject({
	type: v.literal('assistant'),
	...TranscriptMessageBaseSchema,
	effort: lenientString,
	attributionSkill: lenientString,
	attributionMcpServer: lenientString,
	attributionMcpTool: lenientString,
	attributionPlugin: lenientString,
	attributionAgent: lenientString,
	isApiErrorMessage: lenientBoolean,
	error: lenientString,
	apiErrorStatus: lenientNumber,
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

const AgentColorMessageSchema = v.looseObject({
	type: v.literal('agent-color'),
	sessionId: Uuid,
	agentColor: v.string(),
});

const AgentSettingMessageSchema = v.looseObject({
	type: v.literal('agent-setting'),
	sessionId: Uuid,
	agentSetting: v.string(),
});

const PRLinkMessageSchema = v.looseObject({
	type: v.literal('pr-link'),
	sessionId: Uuid,
	prNumber: v.number(),
	prUrl: v.string(),
	prRepository: v.string(),
	timestamp: v.string(),
});

const ModeEntrySchema = v.looseObject({
	type: v.literal('mode'),
	sessionId: Uuid,
	mode: v.picklist(['coordinator', 'normal']),
});

const PermissionModeEntrySchema = v.looseObject({
	type: v.literal('permission-mode'),
	sessionId: Uuid,
	permissionMode: v.string(),
});

const TagMessageSchema = v.looseObject({
	type: v.literal('tag'),
	sessionId: Uuid,
	tag: v.string(),
});

const SummaryMessageSchema = v.looseObject({
	type: v.literal('summary'),
	leafUuid: Uuid,
	summary: v.string(),
});

const TaskSummaryMessageSchema = v.looseObject({
	type: v.literal('task-summary'),
	sessionId: Uuid,
	summary: v.string(),
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

const CostStateEntrySchema = v.looseObject({
	type: v.literal('cost-state'),
	sessionId: Uuid,
	startTime: v.number(),
	totalCostUSD: v.number(),
	// Secondary counters: a renamed or missing one must not drop the whole cost.
	totalLinesAdded: lenientCounter,
	totalLinesRemoved: lenientCounter,
	totalToolDuration: lenientCounter,
	// Per-entry fallback: one malformed model must not drop the breakdown of the others.
	modelUsage: v.fallback(
		v.record(v.string(), v.fallback(v.looseObject({ costUSD: lenientNumber }), {})),
		{}
	),
	hasUnknownModelCost: lenientBoolean,
});

const RelocatedEntrySchema = v.looseObject({
	type: v.literal('relocated'),
	sessionId: Uuid,
	relocatedCwd: v.string(),
});

// Complex / large-payload events — validate type discriminant only.
const SystemEntrySchema = v.looseObject({ type: v.literal('system') });
const AttachmentEntrySchema = v.looseObject({ type: v.literal('attachment') });
const FileHistorySnapshotEntrySchema = v.looseObject({ type: v.literal('file-history-snapshot') });
const AttributionSnapshotEntrySchema = v.looseObject({ type: v.literal('attribution-snapshot') });
const ContextCollapseCommitEntrySchema = v.looseObject({
	type: v.literal('marble-origami-commit'),
});
const ContextCollapseSnapshotEntrySchema = v.looseObject({
	type: v.literal('marble-origami-snapshot'),
});
const ContentReplacementEntrySchema = v.looseObject({ type: v.literal('content-replacement') });
const QueueOperationEntrySchema = v.looseObject({ type: v.literal('queue-operation') });
const SpeculationAcceptEntrySchema = v.looseObject({ type: v.literal('speculation-accept') });

const SessionEntrySchema = v.variant('type', [
	TranscriptMessageUserSchema,
	TranscriptMessageAssistantSchema,
	CustomTitleMessageSchema,
	AiTitleMessageSchema,
	LastPromptMessageSchema,
	AgentNameMessageSchema,
	AgentColorMessageSchema,
	AgentSettingMessageSchema,
	PRLinkMessageSchema,
	ModeEntrySchema,
	PermissionModeEntrySchema,
	TagMessageSchema,
	SummaryMessageSchema,
	TaskSummaryMessageSchema,
	WorktreeStateEntrySchema,
	CostStateEntrySchema,
	RelocatedEntrySchema,
	SystemEntrySchema,
	AttachmentEntrySchema,
	FileHistorySnapshotEntrySchema,
	AttributionSnapshotEntrySchema,
	ContextCollapseCommitEntrySchema,
	ContextCollapseSnapshotEntrySchema,
	ContentReplacementEntrySchema,
	QueueOperationEntrySchema,
	SpeculationAcceptEntrySchema,
]);

/** Every `type` discriminant modelled by {@link SessionEntry}. Internal — used by the format audit. */
export const KNOWN_ENTRY_TYPES: ReadonlySet<string> = new Set(
	SessionEntrySchema.options.map((schema) => schema.entries.type.literal)
);

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

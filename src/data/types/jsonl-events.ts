import * as v from 'valibot';

const Uuid = v.pipe(v.string(), v.uuid());

const TranscriptMessageBase = {
	uuid: Uuid,
	parentUuid: v.nullable(Uuid),
	isSidechain: v.boolean(),
	sessionId: Uuid,
	timestamp: v.string(),
	version: v.string(),
	cwd: v.string(),
	userType: v.string(),
	// message payload — looseObject so unknown fields (e.g. model, usage, content) pass through.
	// Consumers that need typed sub-fields (model, content) cast via helper functions.
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
	// CC marks tool-result-only user messages and compact summaries with these flags.
	// Verified in sessionStorage.ts (getFirstMeaningfulUserMessageTextContent).
	isMeta: v.optional(v.boolean()),
	isCompactSummary: v.optional(v.boolean()),
	// Used for dedup of assistant entries replayed after /resume.
	requestId: v.optional(v.string()),
};

export const TranscriptMessageUserSchema = v.looseObject({
	type: v.literal('user'),
	...TranscriptMessageBase,
});

export const TranscriptMessageAssistantSchema = v.looseObject({
	type: v.literal('assistant'),
	...TranscriptMessageBase,
});

// V0.1 meta-event schemas: each shape was confirmed against real `~/.claude/`
// data. Schemas use `looseObject` because real CC writes may carry fields not
// documented in the source-leak `logs.ts` (e.g. `last-prompt` carries a
// `leafUuid` we discovered while probing). Events from `logs.ts` that we could
// not observe in real data (`summary`, `task-summary`, `tag`, `agent-color`,
// `agent-setting`, `mode`) are intentionally not shipped: they are either
// legacy, gated to internal `USER_TYPE === 'ant'` builds, or never emitted by
// public CC. They will be added once we can validate them on real output.

export const CustomTitleMessageSchema = v.looseObject({
	type: v.literal('custom-title'),
	sessionId: Uuid,
	customTitle: v.string(),
});

export const AiTitleMessageSchema = v.looseObject({
	type: v.literal('ai-title'),
	sessionId: Uuid,
	aiTitle: v.string(),
});

export const LastPromptMessageSchema = v.looseObject({
	type: v.literal('last-prompt'),
	sessionId: Uuid,
	lastPrompt: v.optional(v.string()),
	leafUuid: v.optional(Uuid),
});

export const AgentNameMessageSchema = v.looseObject({
	type: v.literal('agent-name'),
	sessionId: Uuid,
	agentName: v.string(),
});

export const PRLinkMessageSchema = v.looseObject({
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

export const WorktreeStateEntrySchema = v.looseObject({
	type: v.literal('worktree-state'),
	sessionId: Uuid,
	worktreeSession: v.nullable(PersistedWorktreeSessionSchema),
});

export const EntryV01Schema = v.variant('type', [
	TranscriptMessageUserSchema,
	TranscriptMessageAssistantSchema,
	CustomTitleMessageSchema,
	AiTitleMessageSchema,
	LastPromptMessageSchema,
	AgentNameMessageSchema,
	PRLinkMessageSchema,
	WorktreeStateEntrySchema,
]);

export type EntryV01 = v.InferOutput<typeof EntryV01Schema>;

export function safeParseEntry(value: unknown): EntryV01 | null {
	if (value === null || typeof value !== 'object') return null;
	const result = v.safeParse(EntryV01Schema, value);
	return result.success ? result.output : null;
}

export function safeParseEntryFromLine(line: string): EntryV01 | null {
	if (line.length === 0) return null;
	let parsed: unknown;
	try {
		parsed = JSON.parse(line);
	} catch {
		return null;
	}
	return safeParseEntry(parsed);
}

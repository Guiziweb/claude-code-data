import * as v from 'valibot';

const Uuid = v.pipe(v.string(), v.uuid());

const TranscriptMessageBase = {
	uuid: Uuid,
	parentUuid: v.nullable(Uuid),
	isSidechain: v.boolean(),
	sessionId: v.string(),
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
};

export const TranscriptMessageUserSchema = v.looseObject({
	type: v.literal('user'),
	...TranscriptMessageBase,
});

export const TranscriptMessageAssistantSchema = v.looseObject({
	type: v.literal('assistant'),
	...TranscriptMessageBase,
});

// All meta event schemas use `looseObject`: real CC writes may include
// fields not documented in `logs.ts` (e.g. `last-prompt` carries a
// `leafUuid` not present in the source-leak). The canary script (M6.2)
// surfaces structural drift; the parser stays permissive on shape.

export const SummaryMessageSchema = v.looseObject({
	type: v.literal('summary'),
	leafUuid: Uuid,
	summary: v.string(),
});

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

export const TaskSummaryMessageSchema = v.looseObject({
	type: v.literal('task-summary'),
	sessionId: Uuid,
	summary: v.string(),
	timestamp: v.string(),
});

export const TagMessageSchema = v.looseObject({
	type: v.literal('tag'),
	sessionId: Uuid,
	tag: v.string(),
});

export const AgentNameMessageSchema = v.looseObject({
	type: v.literal('agent-name'),
	sessionId: Uuid,
	agentName: v.string(),
});

export const AgentColorMessageSchema = v.looseObject({
	type: v.literal('agent-color'),
	sessionId: Uuid,
	agentColor: v.string(),
});

export const AgentSettingMessageSchema = v.looseObject({
	type: v.literal('agent-setting'),
	sessionId: Uuid,
	agentSetting: v.string(),
});

export const PRLinkMessageSchema = v.looseObject({
	type: v.literal('pr-link'),
	sessionId: Uuid,
	prNumber: v.number(),
	prUrl: v.string(),
	prRepository: v.string(),
	timestamp: v.string(),
});

export const ModeEntrySchema = v.looseObject({
	type: v.literal('mode'),
	sessionId: Uuid,
	mode: v.picklist(['coordinator', 'normal']),
});

const PersistedWorktreeSessionSchema = v.looseObject({
	originalCwd: v.string(),
	worktreePath: v.string(),
	worktreeName: v.string(),
	worktreeBranch: v.optional(v.string()),
	originalBranch: v.optional(v.string()),
	originalHeadCommit: v.optional(v.string()),
	sessionId: v.string(),
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
	SummaryMessageSchema,
	CustomTitleMessageSchema,
	AiTitleMessageSchema,
	LastPromptMessageSchema,
	TaskSummaryMessageSchema,
	TagMessageSchema,
	AgentNameMessageSchema,
	AgentColorMessageSchema,
	AgentSettingMessageSchema,
	PRLinkMessageSchema,
	ModeEntrySchema,
	WorktreeStateEntrySchema,
]);

export type EntryV01 = v.InferOutput<typeof EntryV01Schema>;

export function safeParseEntry(line: string): EntryV01 | null {
	if (line.length === 0) return null;
	let parsed: unknown;
	try {
		parsed = JSON.parse(line);
	} catch {
		return null;
	}
	if (parsed === null || typeof parsed !== 'object') return null;
	const result = v.safeParse(EntryV01Schema, parsed);
	return result.success ? result.output : null;
}

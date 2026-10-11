import { emptyTokenBuckets } from '../token-buckets';
import type { CostStateEntry, SessionEntry } from '../types/jsonl-events';
import { getMessageId, getMessageModel } from '../types/message-helpers';
import type {
	Compaction,
	ContextTurn,
	ParsedSession,
	SessionCost,
	TokenBuckets,
	WorkflowRun,
} from '../types/parsed-session';
import { optionalNumber, optionalString } from './narrow';

const SYNTHETIC_MODEL = '<synthetic>';

// Mirrors CC sessionStoragePortable.ts — patterns for extractFirstPromptFromHead
const SKIP_FIRST_PROMPT_RE = /^(?:\s*<[a-z][\w-]*[\s>]|\[Request interrupted by user[^\]]*\])/;
const COMMAND_NAME_RE = /<command-name>(.*?)<\/command-name>/;
const BASH_INPUT_RE = /<bash-input>([\s\S]*?)<\/bash-input>/;

/**
 * Extracts the first meaningful user prompt from a message content.
 * Mirrors CC `extractFirstPromptFromHead` (sessionStoragePortable.ts):
 * - `<bash-input>cmd</bash-input>` → `! cmd`
 * - Skips XML-like prefixes and `[Request interrupted...]`
 * - Truncates to 200 chars + `…`
 * - Falls back to the first `<command-name>` if no plain text found
 */
function extractFirstPrompt(content: unknown): { prompt: string; isCommand: boolean } | null {
	const rawTexts: string[] = [];
	if (typeof content === 'string') {
		rawTexts.push(content);
	} else if (Array.isArray(content)) {
		for (const block of content as Array<Record<string, unknown>>) {
			if (block.type === 'text' && typeof block.text === 'string') rawTexts.push(block.text);
		}
	}

	let commandFallback: string | undefined;

	for (const raw of rawTexts) {
		const result = raw.replace(/\n/g, ' ').trim();
		if (!result) continue;

		const cmdMatch = COMMAND_NAME_RE.exec(result);
		if (cmdMatch) {
			if (!commandFallback) commandFallback = cmdMatch[1] ?? '';
			continue;
		}

		const bashMatch = BASH_INPUT_RE.exec(result);
		if (bashMatch) return { prompt: `! ${(bashMatch[1] ?? '').trim()}`, isCommand: false };

		if (SKIP_FIRST_PROMPT_RE.test(result)) continue;

		const truncated = result.length > 200 ? `${result.slice(0, 200).trim()}…` : result;
		return { prompt: truncated, isCommand: false };
	}

	if (commandFallback) return { prompt: commandFallback, isCommand: true };
	return null;
}

const HOURS_IN_DAY = 24;

function addUsage(bucket: TokenBuckets, usage: Record<string, unknown> | undefined): void {
	if (!usage) return;
	bucket.input += (usage.input_tokens as number | undefined) ?? 0;
	bucket.output += (usage.output_tokens as number | undefined) ?? 0;
	bucket.cacheRead += (usage.cache_read_input_tokens as number | undefined) ?? 0;
	bucket.cacheCreation += (usage.cache_creation_input_tokens as number | undefined) ?? 0;
}

function addToBucket(
	map: Record<string, TokenBuckets>,
	key: string | undefined,
	usage: Record<string, unknown> | undefined
): void {
	if (!key) return;
	if (!Object.hasOwn(map, key)) map[key] = emptyTokenBuckets();
	addUsage(map[key] as TokenBuckets, usage);
}

function increment(map: Record<string, number>, key: string): void {
	map[key] = (Object.hasOwn(map, key) ? (map[key] as number) : 0) + 1;
}

/**
 * Sums the last `cost-state` of each process run.
 * CC restarts its counters when a session is resumed in a new process, so keeping
 * only the last entry would drop the cost of every earlier run.
 */
function sumCostRuns(lastByRun: Map<number, CostStateEntry>): SessionCost | undefined {
	if (lastByRun.size === 0) return undefined;
	const cost: SessionCost = {
		usd: 0,
		usdByModel: {},
		linesAdded: 0,
		linesRemoved: 0,
		toolDurationMs: 0,
		hasUnknownModelCost: false,
	};
	for (const run of lastByRun.values()) {
		cost.usd += run.totalCostUSD;
		cost.linesAdded += run.totalLinesAdded;
		cost.linesRemoved += run.totalLinesRemoved;
		cost.toolDurationMs += run.totalToolDuration;
		if (run.hasUnknownModelCost) cost.hasUnknownModelCost = true;
		for (const [model, usage] of Object.entries(run.modelUsage)) {
			cost.usdByModel[model] = (cost.usdByModel[model] ?? 0) + (usage.costUSD ?? 0);
		}
	}
	return cost;
}

/**
 * Records a `Workflow` tool launch. CC reuses the run id when a run is resumed,
 * so each launch is appended to the existing run instead of creating a new one.
 */
function recordWorkflowLaunch(
	runs: Map<string, WorkflowRun>,
	result: unknown,
	timestamp: string
): void {
	if (typeof result !== 'object' || result === null) return;
	const r = result as Record<string, unknown>;
	if (r.taskType !== 'local_workflow' || typeof r.runId !== 'string') return;
	const run = runs.get(r.runId);
	if (run) {
		run.launches.push(timestamp);
		return;
	}
	runs.set(r.runId, {
		runId: r.runId,
		name: optionalString(r.workflowName),
		summary: optionalString(r.summary),
		launches: [timestamp],
	});
}

// File-editing tools and the input field holding their target path.
const FILE_EDIT_TOOLS: Record<string, string> = {
	Edit: 'file_path',
	MultiEdit: 'file_path',
	Write: 'file_path',
	NotebookEdit: 'notebook_path',
};

/** A tool call seen in an assistant entry, waiting for its `tool_result`. */
type ToolCall = {
	name: string;
	/** Target path for file-editing tools. */
	filePath: string | undefined;
	/** Set once its `tool_result` has been counted — guards against replayed results. */
	resolved: boolean;
};

function isHumanMessage(content: unknown): boolean {
	if (typeof content === 'string') return content.trim().length > 0;
	if (!Array.isArray(content)) return false;
	return content.some(
		(b) =>
			typeof b === 'object' &&
			b !== null &&
			(b as { type?: unknown }).type === 'text' &&
			typeof (b as { text?: unknown }).text === 'string' &&
			((b as { text?: unknown }).text as string).trim().length > 0
	);
}

/**
 * Aggregates a stream of JSONL entries into a single {@link ParsedSession}.
 *
 * Single-pass — reads each entry once. Computes only metadata + aggregate
 * counters; the per-turn entries are not retained, keeping memory constant
 * regardless of the source's length. Handles:
 * - Meta events (last-wins): `customTitle`, `aiTitle`, `gitBranch`, `prNumber`, etc.
 * - Analytics: tokens (deduplicated), tool/skill usage, hourOfDay, message counts
 * - Deduplication of assistant entries replayed after `/resume` (on `messageId+requestId`;
 *   entries missing either field are not deduplicated — they are counted as-is).
 *   `/resume` = the Claude Code command that continues a previous session; CC replays
 *   all previous assistant messages verbatim into the new file to restore context.
 *
 * Pair with {@link parseJsonlStream} to go from file path to session:
 *
 * @example
 * ```ts
 * const session = await aggregateSession(parseJsonlStream('/path/to/session.jsonl'));
 * console.log(session.gitBranch);    // 'feat/my-feature'
 * console.log(session.tokens.input); // total input tokens
 * ```
 */
export async function aggregateSession(
	events: AsyncIterable<SessionEntry>
): Promise<ParsedSession> {
	let sessionId: string | undefined;
	let customTitle: string | undefined;
	let aiTitle: string | undefined;
	let lastPrompt: string | undefined;
	let prNumber: number | undefined;
	let prUrl: string | undefined;
	let prRepository: string | undefined;
	let worktreePath: string | null | undefined;
	let worktreeBranch: string | undefined;
	let firstPrompt: string | undefined;
	let firstPromptCommandFallback: string | undefined;
	let lastModel: string | undefined;
	const modelCounts: Record<string, number> = {};
	// gitBranch: last-wins — mirrors CC's extractLastJsonStringField behaviour.
	let gitBranch: string | undefined;
	let cwd: string | undefined;
	let claudeCodeVersion: string | undefined;
	let entrypoint: string | undefined;
	let mode: 'coordinator' | 'normal' | undefined;
	let permissionMode: string | undefined;
	let tag: string | undefined;
	let agentName: string | undefined;
	let agentSetting: string | undefined;
	let summary: string | undefined;
	let claudeCharsByFile: Record<string, number> | undefined;
	let taskSummary: string | undefined;
	let firstTimestamp: string | undefined;
	let lastTimestamp: string | undefined;
	let apiDurationMs = 0;

	const tokens = emptyTokenBuckets();
	const tokensByModel: Record<string, TokenBuckets> = {};
	const contextByTurn: ContextTurn[] = [];
	let lastContextTokens = 0;
	let userMessageCount = 0;
	let assistantMessageCount = 0;
	const toolUsage: Record<string, number> = {};
	const skillUsage: Record<string, number> = {};
	const hourOfDay: number[] = new Array(HOURS_IN_DAY).fill(0);
	const costByRun = new Map<number, CostStateEntry>();
	const tokensBySkill: Record<string, TokenBuckets> = {};
	const tokensByMcpServer: Record<string, TokenBuckets> = {};
	const effortUsage: Record<string, number> = {};
	const compactions: Compaction[] = [];
	const apiErrors: Record<string, number> = {};
	let apiRetryCount = 0;
	const toolDenials: Record<string, number> = {};
	const toolErrors: Record<string, number> = {};
	const fileEdits: Record<string, number> = {};
	const workflowRuns = new Map<string, WorkflowRun>();

	// Dedup assistant entries by messageId+requestId — CC replays them after /resume.
	const seenAssistant = new Set<string>();
	// Tool calls by tool_use.id — dedups calls CC streams across several entries,
	// and resolves each tool_result back to its tool name and target file.
	const toolCalls = new Map<string, ToolCall>();

	for await (const entry of events) {
		if (!sessionId && 'sessionId' in entry) {
			sessionId = entry.sessionId;
		}

		switch (entry.type) {
			case 'custom-title':
				customTitle = entry.customTitle;
				break;
			case 'ai-title':
				aiTitle = entry.aiTitle;
				break;
			case 'last-prompt':
				if (entry.lastPrompt !== undefined) lastPrompt = entry.lastPrompt;
				break;
			case 'pr-link':
				prNumber = entry.prNumber;
				prUrl = entry.prUrl;
				prRepository = entry.prRepository;
				break;
			case 'worktree-state':
				worktreePath = entry.worktreeSession?.worktreePath ?? null;
				// Mirror worktreePath semantics: null on exit, undefined when never entered.
				worktreeBranch = entry.worktreeSession?.worktreeBranch;
				break;
			case 'tag':
				tag = entry.tag;
				break;
			case 'agent-name':
				agentName = entry.agentName;
				break;
			case 'agent-color':
				break; // cosmetic only
			case 'agent-setting':
				agentSetting = entry.agentSetting;
				break;
			case 'mode':
				mode = entry.mode;
				break;
			case 'permission-mode':
				permissionMode = entry.permissionMode;
				break;
			case 'summary':
				summary = entry.summary;
				break;
			case 'task-summary':
				taskSummary = entry.summary;
				break;
			case 'cost-state':
				// Last-wins within a run: CC may write the same run several times.
				costByRun.set(entry.startTime, entry);
				break;
			case 'relocated':
				cwd = entry.relocatedCwd;
				break;
			case 'attribution-snapshot': {
				// Last-wins — fileStates never shrinks, so the last snapshot holds cumulative totals.
				// Mirrors CC commitAttribution.ts: only the last snapshot is used, never summed.
				claudeCharsByFile = {};
				for (const [path, state] of Object.entries(entry.fileStates)) {
					claudeCharsByFile[path] = state.claudeContribution;
				}
				break;
			}
			case 'user': {
				if (!firstTimestamp) firstTimestamp = entry.timestamp;
				lastTimestamp = entry.timestamp;
				if (entry.gitBranch) gitBranch = entry.gitBranch;
				cwd = entry.cwd;
				claudeCodeVersion = entry.version;
				if (entry.entrypoint) entrypoint = entry.entrypoint;
				// Mirrors CC sessionStorage.ts: isAgentSidechain = isSidechain && agentId !== undefined
				const isMain = !(entry.isSidechain && entry.agentId !== undefined);
				if (entry.toolDenialKind) increment(toolDenials, entry.toolDenialKind);
				recordWorkflowLaunch(workflowRuns, entry.toolUseResult, entry.timestamp);
				if (Array.isArray(entry.message.content)) {
					for (const block of entry.message.content as Array<Record<string, unknown>>) {
						if (block.type !== 'tool_result' || typeof block.tool_use_id !== 'string') continue;
						const call = toolCalls.get(block.tool_use_id);
						if (!call || call.resolved) continue;
						call.resolved = true;
						if (block.is_error === true) {
							// A refusal is reported as an error result — counted in toolDenials instead.
							if (!entry.toolDenialKind && call.name !== 'Skill') increment(toolErrors, call.name);
						} else if (call.filePath) {
							increment(fileEdits, call.filePath);
						}
					}
				}
				if (isMain && !entry.isMeta && !entry.isCompactSummary) {
					if (isHumanMessage(entry.message.content)) {
						userMessageCount++;
						const hour = entry.timestamp ? new Date(entry.timestamp).getHours() : -1;
						if (hour >= 0 && hour < HOURS_IN_DAY) (hourOfDay[hour] as number)++;
					}
					if (firstPrompt === undefined) {
						const extracted = extractFirstPrompt(entry.message.content);
						if (extracted) {
							if (!extracted.isCommand) firstPrompt = extracted.prompt;
							else if (!firstPromptCommandFallback) firstPromptCommandFallback = extracted.prompt;
						}
					}
				}
				break;
			}
			case 'assistant': {
				const msg = entry.message;
				const model = getMessageModel(msg);

				// Tool usage — deduplicated on tool_use.id, done BEFORE message dedup
				// because CC can stream one API response across multiple entries with
				// complementary content (thinking + tool_use). Skipping the second entry
				// would lose the tool_use.
				if (Array.isArray(msg.content)) {
					for (const block of msg.content as Array<Record<string, unknown>>) {
						if (block.type !== 'tool_use' || typeof block.name !== 'string') continue;
						const input = block.input as Record<string, unknown> | undefined;
						const id = block.id;
						if (typeof id === 'string') {
							if (toolCalls.has(id)) continue;
							const pathField = Object.hasOwn(FILE_EDIT_TOOLS, block.name)
								? FILE_EDIT_TOOLS[block.name]
								: undefined;
							toolCalls.set(id, {
								name: block.name,
								filePath: pathField ? optionalString(input?.[pathField]) : undefined,
								resolved: false,
							});
						}
						if (block.name === 'Skill') {
							const skill = input?.skill;
							if (typeof skill === 'string' && skill.trim()) increment(skillUsage, skill);
						} else {
							increment(toolUsage, block.name);
						}
					}
				}

				// Message-level dedup for tokens, context tracking, and turn routing.
				// /resume replays the previous assistant entries verbatim (same messageId+requestId)
				// — we count each unique API call once.
				const messageId = getMessageId(msg);
				const requestId = entry.requestId;
				if (messageId && requestId) {
					const key = `${messageId}:${requestId}`;
					if (seenAssistant.has(key)) break;
					seenAssistant.add(key);
				}

				if (!firstTimestamp) firstTimestamp = entry.timestamp;
				lastTimestamp = entry.timestamp;
				if (entry.gitBranch) gitBranch = entry.gitBranch;
				cwd = entry.cwd;
				claudeCodeVersion = entry.version;
				if (entry.entrypoint) entrypoint = entry.entrypoint;

				if (entry.isApiErrorMessage) increment(apiErrors, entry.error ?? 'unknown');

				if (model && model !== SYNTHETIC_MODEL) {
					lastModel = model;
					assistantMessageCount++;
					modelCounts[model] = (modelCounts[model] ?? 0) + 1;

					const usage = msg.usage as Record<string, unknown> | undefined;
					const modelKey =
						(usage as { speed?: unknown } | undefined)?.speed === 'fast' ? `${model}-fast` : model;

					if (!tokensByModel[modelKey]) tokensByModel[modelKey] = emptyTokenBuckets();
					addUsage(tokens, usage);
					addUsage(tokensByModel[modelKey], usage);
					addToBucket(tokensBySkill, entry.attributionSkill, usage);
					addToBucket(tokensByMcpServer, entry.attributionMcpServer, usage);
					if (entry.effort) increment(effortUsage, entry.effort);

					const ctxInput = (usage?.input_tokens as number | undefined) ?? 0;
					const ctxCacheRead = (usage?.cache_read_input_tokens as number | undefined) ?? 0;
					const ctxCacheCreation = (usage?.cache_creation_input_tokens as number | undefined) ?? 0;
					const ctxOutput = (usage?.output_tokens as number | undefined) ?? 0;
					const ctxFill = ctxInput + ctxCacheRead + ctxCacheCreation;

					if (ctxFill > 0 && entry.timestamp) {
						contextByTurn.push({
							ts: entry.timestamp,
							input: ctxInput,
							output: ctxOutput,
							cacheRead: ctxCacheRead,
							cacheCreation: ctxCacheCreation,
						});
						lastContextTokens = ctxFill;
					}
				}

				break;
			}
			case 'system':
				if (entry.subtype === 'turn_duration') apiDurationMs += entry.durationMs ?? 0;
				else if (entry.subtype === 'api_error' && entry.source === 'request_retry') apiRetryCount++;
				else if (entry.subtype === 'compact_boundary' && entry.timestamp) {
					const meta = (entry.compactMetadata ?? {}) as Record<string, unknown>;
					compactions.push({
						ts: entry.timestamp,
						trigger: optionalString(meta.trigger),
						preTokens: optionalNumber(meta.preTokens),
						postTokens: optionalNumber(meta.postTokens),
					});
				}
				break;
			default:
				// Internal CC events (attachment, file-history-snapshot,
				// attribution-snapshot, marble-origami-*, content-replacement,
				// queue-operation, speculation-accept) — no ParsedSession extraction.
				break;
		}
	}

	const durationMs =
		firstTimestamp && lastTimestamp
			? new Date(lastTimestamp).getTime() - new Date(firstTimestamp).getTime()
			: 0;

	const primaryModel = Object.entries(modelCounts).sort((a, b) => b[1] - a[1])[0]?.[0];

	return {
		sessionId,
		customTitle,
		aiTitle,
		lastPrompt,
		prNumber,
		prUrl,
		prRepository,
		worktreePath,
		worktreeBranch,
		firstPrompt: firstPrompt ?? firstPromptCommandFallback,
		lastModel,
		primaryModel,
		gitBranch,
		cwd,
		claudeCodeVersion,
		entrypoint,
		mode,
		permissionMode,
		tag,
		agentName,
		agentSetting,
		summary,
		taskSummary,
		claudeCharsByFile,
		firstTimestamp,
		lastTimestamp,
		durationMs,
		apiDurationMs,
		tokens,
		tokensByModel,
		contextByTurn,
		lastContextTokens,
		userMessageCount,
		assistantMessageCount,
		toolUsage,
		skillUsage,
		cost: sumCostRuns(costByRun),
		tokensBySkill,
		tokensByMcpServer,
		effortUsage,
		compactions,
		apiErrors,
		apiRetryCount,
		toolDenials,
		toolErrors,
		fileEdits,
		workflowRuns: [...workflowRuns.values()],
		hourOfDay,
	};
}

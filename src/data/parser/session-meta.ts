import type { SessionEntry } from '../types/jsonl-events';
import { extractTextFromContent, getMessageId, getMessageModel } from '../types/message-helpers';
import type {
	ContextTurn,
	MessageEntry,
	ParsedSession,
	TokenBuckets,
} from '../types/parsed-session';

const SYNTHETIC_MODEL = '<synthetic>';

const HOURS_IN_DAY = 24;

function emptyBuckets(): TokenBuckets {
	return { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 };
}

function addUsage(bucket: TokenBuckets, usage: Record<string, unknown> | undefined): void {
	if (!usage) return;
	bucket.input += (usage.input_tokens as number | undefined) ?? 0;
	bucket.output += (usage.output_tokens as number | undefined) ?? 0;
	bucket.cacheRead += (usage.cache_read_input_tokens as number | undefined) ?? 0;
	bucket.cacheCreation += (usage.cache_creation_input_tokens as number | undefined) ?? 0;
}

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

function routeTurn(
	entry: MessageEntry,
	turns: MessageEntry[],
	subagentTurns: Map<string, MessageEntry[]>
): void {
	// Mirrors CC sessionStorage.ts: isAgentSidechain = entry.isSidechain && entry.agentId !== undefined
	if (entry.isSidechain && entry.agentId !== undefined) {
		const list = subagentTurns.get(entry.agentId) ?? [];
		list.push(entry);
		subagentTurns.set(entry.agentId, list);
	} else {
		turns.push(entry);
	}
}

/**
 * Aggregates a stream of JSONL entries into a single {@link ParsedSession}.
 *
 * Single-pass — reads each entry once. Handles:
 * - Meta events (last-wins): `customTitle`, `aiTitle`, `gitBranch`, `prNumber`, etc.
 * - Analytics: tokens (deduplicated), tool/skill usage, hourOfDay, message counts
 * - Deduplication of assistant entries replayed after `/resume` (on `messageId+requestId`;
 *   entries missing either field are not deduplicated — they are counted as-is).
 *   `/resume` = the Claude Code command that continues a previous session; CC replays
 *   all previous assistant messages verbatim into the new file to restore context.
 * - Routing of subagent turns into `subagentTurns` by `agentId`
 *
 * Pair with {@link parseJsonlStream} to go from file path to session:
 *
 * @example
 * ```ts
 * const session = await aggregateSession(parseJsonlStream('/path/to/session.jsonl'));
 * console.log(session.gitBranch);    // 'feat/my-feature'
 * console.log(session.tokens.input); // total input tokens
 * console.log(session.turns);        // MessageEntry[]
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
	let firstUserText: string | undefined;
	let lastModel: string | undefined;
	const modelCounts: Record<string, number> = {};
	// gitBranch: last-wins — mirrors CC's extractLastJsonStringField behaviour.
	let gitBranch: string | undefined;
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

	const tokens = emptyBuckets();
	const tokensByModel: Record<string, TokenBuckets> = {};
	const contextByTurn: ContextTurn[] = [];
	let lastContextTokens = 0;
	let userMessageCount = 0;
	let assistantMessageCount = 0;
	const toolUsage: Record<string, number> = {};
	const skillUsage: Record<string, number> = {};
	const hourOfDay: number[] = new Array(HOURS_IN_DAY).fill(0);

	const turns: MessageEntry[] = [];
	const subagentTurns = new Map<string, MessageEntry[]>();
	// Dedup assistant entries by messageId+requestId — CC replays them after /resume.
	const seenAssistant = new Set<string>();
	// Dedup tool_use by id — CC can stream one call across multiple entries.
	const seenToolUseId = new Set<string>();

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
				// Mirrors CC sessionStorage.ts: isAgentSidechain = isSidechain && agentId !== undefined
				const isMain = !(entry.isSidechain && entry.agentId !== undefined);
				if (isMain && !entry.isMeta && !entry.isCompactSummary) {
					if (isHumanMessage(entry.message.content)) {
						userMessageCount++;
						const hour = entry.timestamp ? new Date(entry.timestamp).getHours() : -1;
						if (hour >= 0 && hour < HOURS_IN_DAY) (hourOfDay[hour] as number)++;
					}
					if (firstUserText === undefined) {
						const text = extractTextFromContent(entry.message.content);
						if (text) firstUserText = text;
					}
				}
				routeTurn(entry, turns, subagentTurns);
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
						const id = block.id;
						if (typeof id === 'string') {
							if (seenToolUseId.has(id)) continue;
							seenToolUseId.add(id);
						}
						if (block.name === 'Skill') {
							const skill = (block.input as Record<string, unknown> | undefined)?.skill;
							if (typeof skill === 'string' && skill.trim()) {
								skillUsage[skill] = (skillUsage[skill] ?? 0) + 1;
							}
						} else {
							toolUsage[block.name] = (toolUsage[block.name] ?? 0) + 1;
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

				if (model && model !== SYNTHETIC_MODEL) {
					lastModel = model;
					assistantMessageCount++;
					modelCounts[model] = (modelCounts[model] ?? 0) + 1;

					const usage = msg.usage as Record<string, unknown> | undefined;
					const modelKey =
						(usage as { speed?: unknown } | undefined)?.speed === 'fast' ? `${model}-fast` : model;

					if (!tokensByModel[modelKey]) tokensByModel[modelKey] = emptyBuckets();
					addUsage(tokens, usage);
					addUsage(tokensByModel[modelKey], usage);

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

				routeTurn(entry, turns, subagentTurns);
				break;
			}
			default:
				// Internal CC events (system, attachment, file-history-snapshot,
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
		firstUserText,
		lastModel,
		primaryModel,
		gitBranch,
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
		tokens,
		tokensByModel,
		contextByTurn,
		lastContextTokens,
		userMessageCount,
		assistantMessageCount,
		toolUsage,
		skillUsage,
		hourOfDay,
		turns,
		subagentTurns,
	};
}

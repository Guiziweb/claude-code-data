import type { SessionEntry } from '../types/jsonl-events';
import { extractTextFromContent, getMessageId, getMessageModel } from '../types/message-helpers';
import type { MessageEntry, ParsedSession } from '../types/parsed-session';

const SYNTHETIC_MODEL = '<synthetic>';

function routeTurn(
	entry: MessageEntry,
	turns: MessageEntry[],
	subagentTurns: Map<string, MessageEntry[]>
): void {
	if (!entry.agentId) {
		turns.push(entry);
	} else {
		const list = subagentTurns.get(entry.agentId) ?? [];
		list.push(entry);
		subagentTurns.set(entry.agentId, list);
	}
}

/**
 * Aggregates a stream of JSONL entries into a single {@link ParsedSession}.
 *
 * Single-pass — reads each entry once. Handles:
 * - Meta events (last-wins): `customTitle`, `aiTitle`, `gitBranch`, `prNumber`, etc.
 * - Deduplication of assistant entries replayed after `/resume`
 * - Routing of subagent turns into `subagentTurns` by `agentId`
 *
 * Pair with {@link parseJsonlStream} to go from file path to session:
 *
 * @example
 * ```ts
 * const session = await aggregateSession(parseJsonlStream('/path/to/session.jsonl'));
 * console.log(session.gitBranch); // 'feat/my-feature'
 * console.log(session.turns);     // Turn[]
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
	let firstUserText: string | undefined;
	let lastModel: string | undefined;
	// gitBranch: last-wins — full-stream parse means the last value seen equals
	// the last in the file, mirroring CC's extractLastJsonStringField behaviour.
	let gitBranch: string | undefined;
	let firstTimestamp: string | undefined;
	let lastTimestamp: string | undefined;
	const turns: MessageEntry[] = [];
	const subagentTurns = new Map<string, MessageEntry[]>();
	// Dedup assistant entries by messageId+requestId — CC replays them after /resume.
	const seenAssistant = new Set<string>();

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
				break;
			case 'user': {
				if (!firstTimestamp) firstTimestamp = entry.timestamp;
				lastTimestamp = entry.timestamp;
				if (entry.gitBranch) gitBranch = entry.gitBranch;
				const isMainTurn = !entry.agentId;
				if (isMainTurn && firstUserText === undefined && !entry.isMeta && !entry.isCompactSummary) {
					const text = extractTextFromContent(entry.message.content);
					if (text) firstUserText = text;
				}
				routeTurn(entry, turns, subagentTurns);
				break;
			}
			case 'assistant': {
				const messageId = getMessageId(entry.message);
				const requestId = entry.requestId;
				if (messageId && requestId) {
					const key = `${messageId}:${requestId}`;
					if (seenAssistant.has(key)) break;
					seenAssistant.add(key);
				}
				if (!firstTimestamp) firstTimestamp = entry.timestamp;
				lastTimestamp = entry.timestamp;
				if (entry.gitBranch) gitBranch = entry.gitBranch;
				const model = getMessageModel(entry.message);
				if (model && model !== SYNTHETIC_MODEL) lastModel = model;
				routeTurn(entry, turns, subagentTurns);
				break;
			}
		}
	}

	const durationMs =
		firstTimestamp && lastTimestamp
			? new Date(lastTimestamp).getTime() - new Date(firstTimestamp).getTime()
			: 0;

	return {
		sessionId,
		customTitle,
		aiTitle,
		lastPrompt,
		prNumber,
		prUrl,
		prRepository,
		worktreePath,
		firstUserText,
		lastModel,
		gitBranch,
		firstTimestamp,
		lastTimestamp,
		durationMs,
		turns,
		subagentTurns,
	};
}

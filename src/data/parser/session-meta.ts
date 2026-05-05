import type { EntryV01 } from '../types/jsonl-events';
import { extractTextFromContent, getMessageId, getMessageModel } from '../types/message-helpers';
import type { ParsedSession, Turn } from '../types/parsed-session';

const SYNTHETIC_MODEL = '<synthetic>';

function routeTurn(entry: Turn, turns: Turn[], subagentTurns: Map<string, Turn[]>): void {
	if (!entry.agentId) {
		turns.push(entry);
	} else {
		const list = subagentTurns.get(entry.agentId) ?? [];
		list.push(entry);
		subagentTurns.set(entry.agentId, list);
	}
}

export async function aggregateSession(events: AsyncIterable<EntryV01>): Promise<ParsedSession> {
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
	const turns: Turn[] = [];
	const subagentTurns = new Map<string, Turn[]>();
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

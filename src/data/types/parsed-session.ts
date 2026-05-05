import type { EntryV01 } from './jsonl-events';

export type Turn = Extract<EntryV01, { type: 'user' | 'assistant' }>;

export type ParsedSession = {
	sessionId: string | undefined;

	// Meta events (last-wins)
	customTitle: string | undefined;
	aiTitle: string | undefined;
	lastPrompt: string | undefined;
	prNumber: number | undefined;
	prUrl: string | undefined;
	prRepository: string | undefined;
	worktreePath: string | null | undefined;

	// Derived from transcript
	// Raw text of the first main-transcript user message that has non-empty text content.
	// Skips: isMeta, isCompactSummary, subagent messages (agentId set), tool_result-only.
	// Not filtered for slash commands — differs from CC's extractFirstPrompt which strips
	// builtin commands. Consumers should apply their own display logic.
	firstUserText: string | undefined;
	lastModel: string | undefined;
	gitBranch: string | undefined;
	firstTimestamp: string | undefined;
	lastTimestamp: string | undefined;
	durationMs: number;

	turns: Turn[];
	subagentTurns: Map<string, Turn[]>;
};

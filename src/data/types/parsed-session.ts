import type { SessionEntry } from './jsonl-events';

/** A single user or assistant message in a session transcript. */
export type Turn = Extract<SessionEntry, { type: 'user' | 'assistant' }>;

/** Result of {@link aggregateSession} — all data extracted from a single session file. */
export type ParsedSession = {
	sessionId: string | undefined;

	/** User-defined title set via `/title`. Wins over all other title sources. */
	customTitle: string | undefined;
	/** AI-generated title. Fallback after `customTitle`. */
	aiTitle: string | undefined;
	/** Last user prompt captured by Claude Code at session end. */
	lastPrompt: string | undefined;
	/** GitHub PR number linked to this session. */
	prNumber: number | undefined;
	/** Full PR URL as written by Claude Code. Never reconstructed from `prRepository`. */
	prUrl: string | undefined;
	/** Repository in `owner/repo` form. */
	prRepository: string | undefined;
	/** Worktree path if the session ran inside a `claude --worktree`. `null` = exited the worktree. */
	worktreePath: string | null | undefined;

	/**
	 * Raw text of the first main-transcript user message with non-empty text content.
	 * Skips: `isMeta`, `isCompactSummary`, subagent messages, tool_result-only entries.
	 * Not filtered for slash commands — apply your own display logic if needed.
	 */
	firstUserText: string | undefined;
	/** Model used in the last assistant turn. Excludes `<synthetic>` sentinel. */
	lastModel: string | undefined;
	/** Git branch at session end (last-wins, mirrors Claude Code convention). */
	gitBranch: string | undefined;
	/** ISO timestamp of the first entry. */
	firstTimestamp: string | undefined;
	/** ISO timestamp of the last entry. */
	lastTimestamp: string | undefined;
	/** Wall-clock duration in milliseconds (`lastTimestamp - firstTimestamp`). */
	durationMs: number;

	/** All main-transcript turns (user + assistant), in order. Deduplicated after `/resume`. */
	turns: Turn[];
	/** Subagent turns keyed by `agentId`. Populated from inline turns in the main file (legacy). */
	subagentTurns: Map<string, Turn[]>;
};

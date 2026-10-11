import type { Dirent } from 'node:fs';
import { createReadStream } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { createInterface } from 'node:readline';
import type { MessageEntry, ParsedSession, ParsedSubagent } from '../types/parsed-session';
import { parseJsonlStream } from './jsonl';
import { optionalNumber, optionalString } from './narrow';
import { aggregateSession } from './session-meta';

/**
 * Reads session IDs from a project directory.
 *
 * Scans top-level `*.jsonl` files and returns their UUIDs (filename without
 * extension). Excludes legacy `agent-*.jsonl` inline subagent files (CC < 2.1.2).
 * Returns an empty array if the directory does not exist.
 *
 * Pair with {@link readSession} or {@link readSessionTurns} to walk a project.
 *
 * @param projectDir Absolute path to the project directory under `~/.claude/projects/<slug>/`
 * @returns Array of session UUIDs (without `.jsonl` extension), in directory order.
 *
 * @example
 * ```ts
 * const dir = '/Users/me/.claude/projects/-Users-me-my-project';
 *
 * // Sequential — memory-bounded, one session at a time
 * for (const id of await readSessionIds(dir)) {
 *   const session = await readSession(dir, id);
 *   // process and discard
 * }
 *
 * // Parallel — caller picks the strategy (Promise.all, p-limit, …)
 * const ids = await readSessionIds(dir);
 * const sessions = await Promise.all(ids.map((id) => readSession(dir, id)));
 * ```
 */
export async function readSessionIds(projectDir: string): Promise<string[]> {
	let entries: Dirent[];
	try {
		entries = await readdir(projectDir, { withFileTypes: true });
	} catch {
		return [];
	}
	return entries
		.filter((e) => e.isFile() && e.name.endsWith('.jsonl') && !e.name.startsWith('agent-'))
		.map((e) => e.name.slice(0, -'.jsonl'.length));
}

/**
 * Reads and parses one Claude Code session into its aggregate metadata.
 *
 * Streams the main JSONL file and computes counters and last-wins fields
 * (tokens, gitBranch, primaryModel, etc.) without retaining the per-turn
 * entries. Memory usage stays constant regardless of the file size.
 *
 * Pair with {@link readSessionTurns} when you need the message stream.
 *
 * @param projectDir Absolute path to the project directory under `~/.claude/projects/<slug>/`
 * @param sessionId  UUID of the session (without `.jsonl` extension)
 *
 * @example
 * ```ts
 * const session = await readSession(
 *   '/Users/me/.claude/projects/-Users-me-my-project',
 *   'e2b491ed-ec11-4fc3-b9ff-90a11d0a8c0c'
 * );
 * console.log(session.tokens.input);  // total input tokens
 * console.log(session.gitBranch);     // 'feat/my-feature'
 * ```
 */
export async function readSession(projectDir: string, sessionId: string): Promise<ParsedSession> {
	const mainFile = join(projectDir, `${sessionId}.jsonl`);
	return aggregateSession(parseJsonlStream(mainFile));
}

/**
 * Streams the main-transcript turns of a session, one at a time.
 *
 * Yields user and assistant entries from the main JSONL file, in chronological
 * order, skipping subagent turns (`isSidechain && agentId !== undefined`).
 * Memory stays bounded — the consumer can break, filter, or accumulate at will.
 *
 * @param projectDir Absolute path to the project directory under `~/.claude/projects/<slug>/`
 * @param sessionId  UUID of the session (without `.jsonl` extension)
 *
 * @example
 * ```ts
 * // Render a transcript without holding all turns in memory
 * for await (const turn of readSessionTurns(dir, id)) {
 *   render(turn);
 * }
 * ```
 */
export async function* readSessionTurns(
	projectDir: string,
	sessionId: string
): AsyncGenerator<MessageEntry> {
	const mainFile = join(projectDir, `${sessionId}.jsonl`);
	for await (const entry of parseJsonlStream(mainFile)) {
		if (entry.type !== 'user' && entry.type !== 'assistant') continue;
		// Mirrors CC sessionStorage.ts: skip subagent turns from the main transcript stream.
		if (entry.isSidechain && entry.agentId !== undefined) continue;
		yield entry;
	}
}

/**
 * Streams the subagent turns spawned by a session, one at a time.
 *
 * Recursively scans `<sessionId>/subagents/agent-<agentId>.jsonl` files (CC ≥ 2.1.2),
 * including nested layouts (e.g. `subagents/workflows/<runId>/agent-<id>.jsonl`),
 * and yields each user/assistant turn tagged with its `agentId`. Memory stays
 * bounded — the consumer can group, filter, or process incrementally.
 *
 * Yields nothing if the session has no `subagents/` directory.
 *
 * @param projectDir Absolute path to the project directory under `~/.claude/projects/<slug>/`
 * @param sessionId  UUID of the parent session (without `.jsonl` extension)
 *
 * @example
 * ```ts
 * // Group by agent — typical use case
 * const byAgent = new Map<string, MessageEntry[]>();
 * for await (const { agentId, turn } of readSubagentTurns(dir, id)) {
 *   if (!byAgent.has(agentId)) byAgent.set(agentId, []);
 *   byAgent.get(agentId)!.push(turn);
 * }
 * ```
 */
export async function* readSubagentTurns(
	projectDir: string,
	sessionId: string
): AsyncGenerator<{ agentId: string; turn: MessageEntry }> {
	for await (const { agentId, path } of scanSubagentFiles(
		subagentsRoot(projectDir, sessionId),
		0
	)) {
		for await (const e of parseJsonlStream(path)) {
			if (e.type === 'user' || e.type === 'assistant') yield { agentId, turn: e };
		}
	}
}

/**
 * Streams one aggregate per subagent spawned by a session.
 *
 * Scans the same files as {@link readSubagentTurns} and aggregates each one like
 * {@link readSession}, one at a time — memory stays bounded by a single subagent.
 * Agent metadata comes from the sibling `agent-<id>.meta.json`; its fields are
 * `undefined` when the file is missing or unreadable.
 *
 * Yields nothing if the session has no `subagents/` directory.
 *
 * @param projectDir Absolute path to the project directory under `~/.claude/projects/<slug>/`
 * @param sessionId  UUID of the parent session (without `.jsonl` extension)
 *
 * @example
 * ```ts
 * // Output tokens per agent type
 * const byType: Record<string, number> = {};
 * for await (const sub of readSubagents(dir, id)) {
 *   const type = sub.agentType ?? 'unknown';
 *   byType[type] = (byType[type] ?? 0) + sub.tokens.output;
 * }
 * ```
 */
export async function* readSubagents(
	projectDir: string,
	sessionId: string
): AsyncGenerator<ParsedSubagent> {
	// Files of one run are yielded consecutively: keep only the current run's journal.
	let journalRunId: string | undefined;
	let journal = new Map<string, WorkflowStatus>();

	for await (const { agentId, path, workflowRunId } of scanSubagentFiles(
		subagentsRoot(projectDir, sessionId),
		0
	)) {
		if (workflowRunId && workflowRunId !== journalRunId) {
			journalRunId = workflowRunId;
			journal = await readWorkflowJournal(join(path, '..', 'journal.jsonl'));
		}
		const [s, meta] = await Promise.all([
			aggregateSession(parseJsonlStream(path)),
			readSubagentMeta(`${path.slice(0, -'.jsonl'.length)}.meta.json`),
		]);
		yield {
			agentId,
			...meta,
			workflowRunId,
			workflowStatus: workflowRunId ? journal.get(agentId) : undefined,
			tokens: s.tokens,
			tokensByModel: s.tokensByModel,
			tokensBySkill: s.tokensBySkill,
			tokensByMcpServer: s.tokensByMcpServer,
			contextByTurn: s.contextByTurn,
			lastContextTokens: s.lastContextTokens,
			lastModel: s.lastModel,
			primaryModel: s.primaryModel,
			assistantMessageCount: s.assistantMessageCount,
			toolUsage: s.toolUsage,
			skillUsage: s.skillUsage,
			effortUsage: s.effortUsage,
			compactions: s.compactions,
			apiErrors: s.apiErrors,
			toolDenials: s.toolDenials,
			firstTimestamp: s.firstTimestamp,
			lastTimestamp: s.lastTimestamp,
			durationMs: s.durationMs,
		};
	}
}

type SubagentMeta = Pick<
	ParsedSubagent,
	'agentType' | 'spawnDepth' | 'parentAgentId' | 'toolUseId' | 'description'
>;

async function readSubagentMeta(metaPath: string): Promise<SubagentMeta> {
	let raw: Record<string, unknown> = {};
	try {
		const parsed: unknown = JSON.parse(await readFile(metaPath, 'utf8'));
		if (typeof parsed === 'object' && parsed !== null) raw = parsed as Record<string, unknown>;
	} catch {
		// Missing or corrupted meta file — every field stays undefined.
	}
	return {
		agentType: optionalString(raw.agentType),
		spawnDepth: optionalNumber(raw.spawnDepth),
		parentAgentId: optionalString(raw.parentAgentId),
		toolUseId: optionalString(raw.toolUseId),
		description: optionalString(raw.description),
	};
}

type WorkflowStatus = NonNullable<ParsedSubagent['workflowStatus']>;

const JOURNAL_STATUS: Record<string, WorkflowStatus> = {
	started: 'started',
	result: 'done',
	failed: 'failed',
};

/**
 * Reads a workflow `journal.jsonl` into the last status of each agent.
 * Each agent logs `started`, then `result` or `failed`. Unknown lines are skipped.
 * A missing or unreadable journal yields what was read so far — it must never stop
 * the subagent stream.
 */
async function readWorkflowJournal(journalPath: string): Promise<Map<string, WorkflowStatus>> {
	const statuses = new Map<string, WorkflowStatus>();
	try {
		const rl = createInterface({
			input: createReadStream(journalPath, 'utf8'),
			crlfDelay: Infinity,
		});
		for await (const line of rl) {
			let entry: { type?: unknown; agentId?: unknown };
			try {
				entry = JSON.parse(line);
			} catch {
				continue;
			}
			const status = typeof entry?.type === 'string' ? JOURNAL_STATUS[entry.type] : undefined;
			if (status && typeof entry.agentId === 'string') statuses.set(entry.agentId, status);
		}
	} catch {
		// Missing (ENOENT) or unreadable journal — statuses stay undefined.
	}
	return statuses;
}

function subagentsRoot(projectDir: string, sessionId: string): string {
	return join(projectDir, sessionId, 'subagents');
}

// Caps recursive descent — protects against symlink loops or pathological layouts.
// CC's known nested layout is `subagents/workflows/<runId>/agent-*.jsonl` (depth 2).
const SUBAGENT_SCAN_MAX_DEPTH = 8;

// Workflow agents live in `subagents/workflows/<runId>/`.
const WORKFLOWS_DIR = 'workflows';

async function* scanSubagentFiles(
	dir: string,
	depth: number,
	workflowRunId?: string
): AsyncGenerator<{ agentId: string; path: string; workflowRunId: string | undefined }> {
	if (depth > SUBAGENT_SCAN_MAX_DEPTH) return;

	let entries: Dirent[];
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch {
		return;
	}
	for (const entry of entries) {
		if (entry.isFile() && entry.name.startsWith('agent-') && entry.name.endsWith('.jsonl')) {
			// Mirrors CC: name.slice('agent-'.length, -'.jsonl'.length)
			const agentId = entry.name.slice('agent-'.length, -'.jsonl'.length);
			yield { agentId, path: join(dir, entry.name), workflowRunId };
		} else if (entry.isDirectory()) {
			// depth 1 is inside `subagents/workflows/`: each child directory is one run.
			const runId =
				workflowRunId ?? (depth === 1 && basename(dir) === WORKFLOWS_DIR ? entry.name : undefined);
			yield* scanSubagentFiles(join(dir, entry.name), depth + 1, runId);
		}
	}
}

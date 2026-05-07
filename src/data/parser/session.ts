import type { Dirent } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { MessageEntry, ParsedSession } from '../types/parsed-session';
import { parseJsonlStream } from './jsonl';
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
	const root = join(projectDir, sessionId, 'subagents');
	yield* scanSubagents(root, 0);
}

// Caps recursive descent — protects against symlink loops or pathological layouts.
// CC's known nested layout is `subagents/workflows/<runId>/agent-*.jsonl` (depth 2).
const SUBAGENT_SCAN_MAX_DEPTH = 8;

async function* scanSubagents(
	dir: string,
	depth: number
): AsyncGenerator<{ agentId: string; turn: MessageEntry }> {
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
			for await (const e of parseJsonlStream(join(dir, entry.name))) {
				if (e.type === 'user' || e.type === 'assistant') yield { agentId, turn: e };
			}
		} else if (entry.isDirectory()) {
			yield* scanSubagents(join(dir, entry.name), depth + 1);
		}
	}
}

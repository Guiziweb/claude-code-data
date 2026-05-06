import type { Dirent } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { MessageEntry, ParsedSession } from '../types/parsed-session';
import { parseJsonlStream } from './jsonl';
import { aggregateSession } from './session-meta';

/**
 * Reads all subagent JSONL files for a session and returns a map of
 * `agentId → MessageEntry[]`.
 *
 * Mirrors CC's `loadAllSubagentTranscriptsFromDisk` but scans recursively to
 * also cover nested layouts (e.g. `subagents/workflows/<runId>/agent-<id>.jsonl`).
 * Filename format: `agent-<agentId>.jsonl` — verified in CC source (sessionStorage.ts).
 */
async function readSubagentTurns(
	projectDir: string,
	sessionId: string
): Promise<Map<string, MessageEntry[]>> {
	const result = new Map<string, MessageEntry[]>();
	await scanSubagentsDir(join(projectDir, sessionId, 'subagents'), result);
	return result;
}

async function scanSubagentsDir(dir: string, result: Map<string, MessageEntry[]>): Promise<void> {
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
			await addAgentFile(join(dir, entry.name), agentId, result);
		} else if (entry.isDirectory()) {
			await scanSubagentsDir(join(dir, entry.name), result);
		}
	}
}

async function addAgentFile(
	filePath: string,
	agentId: string,
	result: Map<string, MessageEntry[]>
): Promise<void> {
	const turns: MessageEntry[] = [];
	for await (const entry of parseJsonlStream(filePath)) {
		if (entry.type === 'user' || entry.type === 'assistant') {
			turns.push(entry);
		}
	}

	if (turns.length > 0) {
		const existing = result.get(agentId) ?? [];
		result.set(agentId, [...existing, ...turns]);
	}
}

/**
 * Parses a complete Claude Code session — main transcript + all subagent files.
 *
 * This is the recommended entry point when working with a known session on disk.
 * It correctly populates `subagentTurns` from separate subagent JSONL files
 * (CC ≥ 2.1.2) in addition to any inline subagent turns in the main transcript.
 *
 * @param projectDir Absolute path to the project directory under `~/.claude/projects/<slug>/`
 * @param sessionId  UUID of the session (without `.jsonl` extension)
 *
 * @example
 * ```ts
 * const session = await parseSession(
 *   '/Users/me/.claude/projects/-Users-me-my-project',
 *   'e2b491ed-ec11-4fc3-b9ff-90a11d0a8c0c'
 * );
 * console.log(session.gitBranch);
 * console.log(session.subagentTurns.size); // populated from separate files
 * ```
 */
export async function parseSession(projectDir: string, sessionId: string): Promise<ParsedSession> {
	const mainFile = join(projectDir, `${sessionId}.jsonl`);
	const session = await aggregateSession(parseJsonlStream(mainFile));

	const fromFiles = await readSubagentTurns(projectDir, sessionId);
	for (const [agentId, turns] of fromFiles) {
		const existing = session.subagentTurns.get(agentId) ?? [];
		session.subagentTurns.set(agentId, [...existing, ...turns]);
	}

	return session;
}

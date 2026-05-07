# claude-code-data

> TypeScript parser for Claude Code's local session data.

[![npm](https://img.shields.io/npm/v/claude-code-data.svg)](https://www.npmjs.com/package/claude-code-data)
[![coverage: 100%](https://img.shields.io/badge/coverage-100%25-brightgreen)](#)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)

Get clean, typed analytics from your Claude Code sessions — tokens used, git branches, tools called, full transcripts. Reads the JSONL files Claude Code stores under `~/.claude/projects/`.

## Install

```bash
npm install claude-code-data
```

## Usage

### Analytics — session metadata only

```ts
import { readSession, readSessionIds } from 'claude-code-data';

const dir = '/Users/me/.claude/projects/-Users-me-my-project';

for (const id of await readSessionIds(dir)) {
  const s = await readSession(dir, id);
  const tokens = s.tokens.input + s.tokens.output;
  console.log(`[${s.gitBranch}] ${s.firstPrompt} — ${tokens.toLocaleString()} tokens`);
}
// [feat/auth-refactor] Add JWT refresh token rotation — 87,432 tokens
// [fix/payment-bug]    Stripe webhook fails on retry  — 23,104 tokens
// [main]               How do I set up the test suite — 12,301 tokens
```

`readSession` streams the JSONL once and returns aggregate fields only (tokens, branch, first prompt, …). Memory stays constant regardless of session size.

### Transcripts — turns streamed one at a time

```ts
import { readSessionTurns } from 'claude-code-data';

for await (const turn of readSessionTurns(dir, sessionId)) {
  render(turn);
}
```

`readSessionTurns` yields `MessageEntry` values from the main file as an async iterable. Memory stays bounded — useful for rendering long transcripts or mining content without holding everything at once.

### Subagents — Task-tool delegations

```ts
import { readSubagentTurns } from 'claude-code-data';

const byAgent = new Map<string, MessageEntry[]>();
for await (const { agentId, turn } of readSubagentTurns(dir, sessionId)) {
  const turns = byAgent.get(agentId) ?? [];
  turns.push(turn);
  byAgent.set(agentId, turns);
}
```

`readSubagentTurns` walks `<sessionId>/subagents/` (including nested layouts) and yields each subagent turn tagged with its `agentId`. The caller groups, filters, or processes incrementally.

### Composition

The walking strategy is up to you. Sequential, `Promise.all`, `p-limit` — whatever fits your workload:

```ts
const ids = await readSessionIds(dir);
const sessions = await Promise.all(ids.map((id) => readSession(dir, id)));
```

## Why

Claude Code stores conversations as JSONL files. Reading them correctly has many edge cases — different event types, subagent files in separate folders, transcripts replayed after `/resume` that double-count tokens.

This library handles all of that, so you can build analytics dashboards, session browsers, or scripts without reimplementing the parser.

## Data model

```
~/.claude/projects/
  └── <project-slug>/                       ← a project = a working directory
      └── <session-id>.jsonl                ← a session = one conversation
      └── <session-id>/subagents/agent-*.jsonl  ← subagents (CC ≥ 2.1.2)
```

## API

```ts
readSessionIds(projectDir)               // string[]                                  — session UUIDs
readSession(projectDir, sessionId)       // ParsedSession                             — aggregate metadata
readSessionTurns(projectDir, sessionId)  // AsyncGenerator<MessageEntry>              — streamed main turns
readSubagentTurns(projectDir, sessionId) // AsyncGenerator<{ agentId, turn }>         — streamed subagent turns
```

Four primitives, each does one thing. The library never decides for you whether to parse all sessions in parallel, sequentially, or with a concurrency limit — that orchestration belongs to the caller. See [`ParsedSession`](https://guiziweb.github.io/claude-code-data/types/ParsedSession.html) and [`MessageEntry`](https://guiziweb.github.io/claude-code-data/types/MessageEntry.html) for all available fields.

## License

[MIT](./LICENSE)
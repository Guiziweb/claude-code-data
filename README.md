# claude-data-api

> TypeScript parser for Claude Code's local session data.

[![status: early development](https://img.shields.io/badge/status-early%20development-orange)](#)
[![coverage: 100%](https://img.shields.io/badge/coverage-100%25-brightgreen)](#)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)

Parses `~/.claude/projects/**/*.jsonl` into typed TypeScript — sessions, turns, metadata — without re-implementing JSONL event handling every time.

```ts
import { parseJsonlStream, aggregateSession } from 'claude-data-api';

const session = await aggregateSession(parseJsonlStream('/path/to/session.jsonl'));

console.log(session.gitBranch);   // 'feat/my-feature'
console.log(session.turns);       // Turn[]
console.log(session.firstUserText); // 'Hello'
```

## Why

Claude Code writes structured JSONL transcripts for every session. Reading them means dealing with 20+ event variants, format drift across CC versions, deduplication after `/resume`, and subagent routing. This library handles all of that.

## What's parsed

- **Session metadata** — `customTitle`, `aiTitle`, `lastPrompt`, `gitBranch`, `prNumber`, `prUrl`, `worktreePath`, `firstUserText`, `lastModel`, timestamps, duration
- **Turns** — full `user` and `assistant` entries with typed content blocks
- **Subagent turns** — separated by `agentId`, keyed in a `Map`
- **Dedup** — `/resume` replays assistant entries; deduplicated on `messageId+requestId`

## Stack

- [Bun](https://bun.sh) — runtime, test runner
- [Valibot](https://valibot.dev) — schema validation
- [Biome](https://biomejs.dev) — lint + format

## Status

**Early development.** Parser is stable and 100% covered. Analytics (tokens, tool usage) coming next.

## License

[MIT](./LICENSE)
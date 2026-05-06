# claude-data-api

> TypeScript parser for Claude Code's local session data.

[![status: beta](https://img.shields.io/badge/status-beta-yellow)](#)
[![coverage: 100%](https://img.shields.io/badge/coverage-100%25-brightgreen)](#)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)

Parses `~/.claude/projects/**/*.jsonl` into typed TypeScript. Handles all CC event variants, deduplication after `/resume`, subagent routing, and analytics extraction — all verified against the CC source.

```ts
import { parseSession } from 'claude-data-api';

const session = await parseSession(
  '/Users/me/.claude/projects/-Users-me-my-project',
  'e2b491ed-ec11-4fc3-b9ff-90a11d0a8c0c'
);

session.firstPrompt        // 'Fix the parser bug'
session.tokens.input       // 7231  (deduplicated — /resume replays counted once)
session.toolUsage.Bash     // 276
session.subagentTurns.size // 3
```

## Why

Claude Code stores every session as a JSONL file under `~/.claude/projects/`. Reading them correctly means handling versioned event variants, deduplicating entries replayed after `/resume`, routing subagent turns to separate files, and extracting analytics from raw usage fields.

This library does that once, correctly, verified against the CC source — so you can build analytics dashboards, session browsers, or scripts without reimplementing the parser.

## API

```ts
// Full session — main transcript + subagent files
const session = await parseSession(projectDir, sessionId);
```

```ts
// Stream any AsyncIterable<SessionEntry>
const session = await aggregateSession(parseJsonlStream('/path/to/file.jsonl'));
```

```ts
// Parse a single JSONL entry
const entry = safeParseEntry(rawObject); // null for unknown types
```

`ParsedSession` includes: titles, git branch, PR link, token usage per model, tool/skill counts, message counts, context window fill, hourly activity, and all transcript turns.

Full type docs: [guiziweb.github.io/claude-data-api](https://guiziweb.github.io/claude-data-api)

## Stack

- [Bun](https://bun.sh) — runtime, test runner
- [Valibot](https://valibot.dev) — schema validation
- [Biome](https://biomejs.dev) — lint + format

## License

[MIT](./LICENSE)
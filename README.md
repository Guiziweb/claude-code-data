# claude-code-data

> TypeScript parser for Claude Code's local session data.

[![status: beta](https://img.shields.io/badge/status-beta-yellow)](#)
[![coverage: 100%](https://img.shields.io/badge/coverage-100%25-brightgreen)](#)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)

Get clean, typed analytics from your Claude Code sessions — tokens used, git branches, tools called, full transcripts. Reads the JSONL files Claude Code stores under `~/.claude/projects/`.

```ts
import { parseAllSessions } from 'claude-code-data';

const sessions = await parseAllSessions(
  '/Users/me/.claude/projects/-Users-me-my-project'
);

for (const s of sessions) {
  const tokens = s.tokens.input + s.tokens.output;
  console.log(`[${s.gitBranch}] ${s.firstPrompt} — ${tokens.toLocaleString()} tokens`);
}
// [feat/auth-refactor] Add JWT refresh token rotation — 87,432 tokens
// [fix/payment-bug]    Stripe webhook fails on retry  — 23,104 tokens
// [main]               How do I set up the test suite — 12,301 tokens
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
parseAllSessions(projectDir)           // ParsedSession[]
parseSession(projectDir, sessionId)    // ParsedSession (with subagents)
```

See [`ParsedSession`](https://guiziweb.github.io/claude-code-data/types/ParsedSession.html) for all available fields.

## License

[MIT](./LICENSE)
# claude-data-api

> GraphQL gateway for Claude Code's local data.

[![status: early development](https://img.shields.io/badge/status-early%20development-orange)](#)
[![coverage: 100%](https://img.shields.io/badge/coverage-100%25-brightgreen)](#)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)

A self-hosted GraphQL API that exposes the full content of `~/.claude/` -
sessions, memories, projects, tasks, settings - for any tool that wants to
read what Claude Code has written.

```graphql
query {
  projects {
    slug
    sessions(last: 5) {
      id
      lastModel
      tokens { input output cacheRead cacheCreation }
      turns { ts model }
    }
  }
}
```

## Why

Claude Code writes a lot of structured data locally - JSONL transcripts of
every session, auto-memories per project, tasks, settings, history, and more.
That data is rich, but reading it directly means parsing 20+ JSONL event
variants, dealing with format drift across CC versions, and re-implementing
aggregations every time.

This project gives you a single, typed entry point: **a GraphQL endpoint that
mirrors the entire `~/.claude/` tree**, parses it into a stable schema, and
keeps an in-memory index in sync with the filesystem.

## Status

**Early development.** The schema, endpoints, and on-disk parsers are still
moving. Expect breaking changes until **v1.0**. Versions in the `v0.x` line
follow semantic versioning; consult [`CHANGELOG.md`](./CHANGELOG.md) before
upgrading.

## Scope

- Sessions (full JSONL events, parsed and typed)
- Auto-memories per project
- Live sessions (currently running)
- Tasks
- Global prompt history
- User settings (`settings.json`, `~/.claude/CLAUDE.md`)
- Subagents (when present)

Out of scope: caches, IDE locks, shell snapshots, OS-specific tooling state.

## Privacy

The API exposes **everything** Claude Code keeps locally - including your
prompts, the code Claude has seen, and any secrets that may have leaked into
context. By default the server **binds to `127.0.0.1`** and refuses remote
connections. If you change that, secure the endpoint yourself (reverse proxy,
auth, firewall).

## Stack

- [Bun](https://bun.sh) - runtime, test runner, package manager
- [GraphQL Yoga](https://the-guild.dev/graphql/yoga-server) - HTTP layer
- [Pothos](https://pothos-graphql.dev) - code-first schema builder
- [Valibot](https://valibot.dev) - input validation, modular & fast
- [graphql-scalars](https://the-guild.dev/graphql/scalars) - `DateTime`, `JSON` scalars
- [chokidar](https://github.com/paulmillr/chokidar) - cross-platform `fs.watch`
- [Biome](https://biomejs.dev) - lint + format

## Compatibility

Officially supported:
- macOS (arm64, x64)
- Linux (x64, arm64)

## Quickstart

> **Not yet - the project is bootstrapping.**

```sh
# placeholder, will be available after v0.1.0
bun install
bun run dev
# open http://localhost:4000/graphql
```

## License

[MIT](./LICENSE)

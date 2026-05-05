# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

This file is generated automatically on tagged releases from Conventional Commits.
Until the first tagged release, only the `Unreleased` section is maintained.

## [Unreleased]

### Added
- JSONL event parser — discriminated union Valibot, 8 event variants (user, assistant, custom-title, ai-title, last-prompt, pr-link, worktree-state, agent-name)
- ContentBlock schemas — 7 variants (text, thinking, redacted_thinking, tool_use, tool_result, image, document)
- `parseJsonlStream` — readline-based async generator, memory-bounded
- `aggregateSession` — single-pass accumulator, dedup `/resume` replays, subagent routing

### Changed
- Pivoted from GraphQL gateway to npm library — `src/data/` is the public API
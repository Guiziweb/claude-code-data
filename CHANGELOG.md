# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

This file is generated automatically on tagged releases from Conventional Commits.
Until the first tagged release, only the `Unreleased` section is maintained.

## 1.0.0 (2026-05-07)


### Features

* **m3.2:** analytics — tokens, tools, hourOfDay, message counts, context window ([#30](https://github.com/Guiziweb/claude-code-data/issues/30)) ([477946a](https://github.com/Guiziweb/claude-code-data/commit/477946ad36cefd2d83b6eee5a17c613c61fe5ac0))
* **m3.3:** complete SessionEntry union + meta fields ([#31](https://github.com/Guiziweb/claude-code-data/issues/31)) ([cd25ea1](https://github.com/Guiziweb/claude-code-data/commit/cd25ea1af2ea4f4964b300fbb9c63cfc7730642d))
* **m3.4:** claudeCharsByFile from attribution-snapshot ([#32](https://github.com/Guiziweb/claude-code-data/issues/32)) ([2f2b58c](https://github.com/Guiziweb/claude-code-data/commit/2f2b58c7698fab33eec4c612fba4f3dbdbefbed8))
* **m3.5:** firstPrompt — CC-exact extraction, rename firstUserText ([#33](https://github.com/Guiziweb/claude-code-data/issues/33)) ([f39ae05](https://github.com/Guiziweb/claude-code-data/commit/f39ae054f7eafe5c38990372009bfa8b773a6ddc))
* **m3.6:** apiDurationMs from system/turn_duration events ([#41](https://github.com/Guiziweb/claude-code-data/issues/41)) ([6c0ddbf](https://github.com/Guiziweb/claude-code-data/commit/6c0ddbf709fdf44b9ab19cfc39a969366f3269b1)), closes [#40](https://github.com/Guiziweb/claude-code-data/issues/40)
* **parser:** add parseSession — reads main transcript + subagent files (M3.1) ([#29](https://github.com/Guiziweb/claude-code-data/issues/29)) ([74f4429](https://github.com/Guiziweb/claude-code-data/commit/74f44293a59ae6d335c78ba8e1f490d04f5396e2))
* **parser:** add session aggregator (M2.4) ([#25](https://github.com/Guiziweb/claude-code-data/issues/25)) ([aa90893](https://github.com/Guiziweb/claude-code-data/commit/aa9089394b02d69b151ad6cd9ff9cd37e78bf6aa))
* **parser:** add stream-based JSONL parser ([#23](https://github.com/Guiziweb/claude-code-data/issues/23)) ([fe4e37c](https://github.com/Guiziweb/claude-code-data/commit/fe4e37c646b58fa5fbadbbbf70acaa997ad2302e))
* **parser:** add Valibot schemas for V0.1 ContentBlock variants ([#22](https://github.com/Guiziweb/claude-code-data/issues/22)) ([47ea181](https://github.com/Guiziweb/claude-code-data/commit/47ea181cb1a3df69b84d0b9a0ae14fc84cf8cf4e))
* **parser:** add Valibot schemas for V0.1 JSONL events ([#20](https://github.com/Guiziweb/claude-code-data/issues/20)) ([15b1217](https://github.com/Guiziweb/claude-code-data/commit/15b1217fa58f5ed63bfe4af4a709678be810b6f3))

## [Unreleased]

### Added
- `parseSession(projectDir, sessionId)` — parse one session with subagents
- `parseAllSessions(projectDir)` — parse every session in a project
- `ParsedSession` type — aggregated session data (tokens, branch, PR, tools, transcript, ...)
- ContentBlock typed schemas (text, thinking, tool_use, tool_result, image, document)

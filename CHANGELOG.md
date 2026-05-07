# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

This file is generated automatically on tagged releases from Conventional Commits.
Until the first tagged release, only the `Unreleased` section is maintained.

## [Unreleased]

### Added
- `parseSession(projectDir, sessionId)` — parse one session with subagents
- `parseAllSessions(projectDir)` — parse every session in a project
- `ParsedSession` type — aggregated session data (tokens, branch, PR, tools, transcript, ...)
- ContentBlock typed schemas (text, thinking, tool_use, tool_result, image, document)
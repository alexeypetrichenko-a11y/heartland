# AGENTS.md — Heartland Development Rules

## 1. Project Overview

Heartland is a modern global geopolitical strategy game focused primarily on world politics, economics, diplomacy and international relations.

The game is inspired by grand strategy games such as Hearts of Iron, but aims to provide a broader geopolitical experience rather than focusing predominantly on warfare.

Military operations, armed conflicts and territorial control are important components of the game, alongside economic development, trade, political influence and diplomacy.

The precise balance between these systems and their gameplay mechanics will be defined progressively in `GAME_DESIGN.md`. Codex must not invent or implement these mechanics without explicit approval.

The primary target is iPhone, using a browser-based Progressive Web App (PWA).

The long-term goal is to support fully offline gameplay on the device.

The project is developed by a non-programmer with assistance from Codex. Development time is limited, so simplicity, reliability and early playability are essential.

## 2. Authority and Decision-Making

- The project owner makes all game design and feature decisions.
- Codex is responsible for technical implementation and may recommend better approaches.
- Never introduce new game mechanics, features, dependencies or major architectural changes without explicit approval.
- Do not interpret a general project vision as authorization to implement all of its features.
- If requirements are ambiguous and materially affect the outcome, ask for clarification before implementing.
- Technical implementation details may be decided autonomously when they remain within the approved scope.

## 3. Scope Control

- Implement only the specifically requested task.
- Prefer small, independently testable changes.
- Do not perform unrelated refactoring, redesign or optimization.
- Do not implement future tasks ahead of schedule.
- Avoid speculative infrastructure and unnecessary abstractions.
- When a task is too large, propose smaller steps before implementation.

## 4. Architecture

- Use the existing React, TypeScript and Vite stack.
- Keep game rules and state transitions separate from UI components.
- Favor deterministic, testable game logic.
- Maintain a modular architecture without unnecessary complexity.
- Preserve compatibility with the existing codebase.
- Do not introduce backend services or cloud dependencies without approval.

## 5. Mobile and Offline Requirements

- Design for iPhone screens and touch interactions first.
- Respect iPhone safe areas and responsive layouts.
- Avoid desktop-only interactions.
- Offline gameplay is a long-term requirement, not a claim that it is already implemented.
- Do not introduce mandatory internet connections for gameplay without approval.
- Do not implement PWA infrastructure until explicitly requested.

## 6. Quality and Testing

- Preserve existing working functionality.
- Run `npm run build` after code changes.
- Add focused tests when implementing non-trivial game rules.
- Report any failed tests, build errors or unverified assumptions.
- Never claim a feature works unless it has been tested appropriately.
- Do not hide errors or silently remove functionality to make tests pass.

## 7. GitHub Workflow

- Use a dedicated branch for each development task.
- Create a Pull Request targeting `main` when supported.
- Never merge a Pull Request without explicit authorization.
- Keep the existing GitHub Pages deployment workflow working.
- Never commit passwords, API keys, credentials or other secrets.
- Do not modify repository settings or deployment configuration unless requested.

## 8. Project Documentation

The project uses the following documents:

- `AGENTS.md`: development instructions and constraints.
- `GAME_DESIGN.md`: approved game concepts, rules and open design questions.
- `STATUS.md`: current implementation status and known issues.
- `TASKS.md`: development backlog and next steps.

Read relevant documentation before starting work.

Update `STATUS.md` and `TASKS.md` when appropriate, once these files exist. Do not invent completed features or silently change approved game rules.

## 9. Reporting

After each task, provide a concise report in plain language:

1. What was changed.
2. Which files were created or modified.
3. What was tested and the results.
4. Any errors, limitations or unresolved questions.
5. The Pull Request link, if one was created.

Explain technical decisions in language understandable to a non-programmer.

## 10. Core Development Principle

**Build the smallest working version first. Validate it on iPhone. Stabilize it before adding complexity.**

When uncertain, prefer the simplest solution that satisfies the explicitly approved requirements.

Never expand scope merely because additional functionality would be useful or impressive.

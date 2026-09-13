---
name: plan
description: Produces a written technical implementation plan before any code is changed. Use when the user asks to plan, design, scope, or think through how to build a feature, refactor, or system change, or asks "how should we build this". Not for trivial single-file changes.
argument-hint: "[feature or task to plan]"
allowed-tools: Bash(git log *) Bash(git diff *) Bash(git status *)
---

# Plan an implementation

Task: $ARGUMENTS

Produce a plan that someone else could execute. Do not write implementation code while planning.

## Process

1. **Restate the goal** in one or two sentences: what "done" looks like, and what is explicitly out of scope. If the goal is ambiguous in a way that would change the design, ask now, before exploring.
2. **Explore before designing.** Read the code the change will touch. Note existing patterns, conventions, and utilities the plan must reuse. List the files that will change and the files that will be created.
3. **Choose an approach.** If two approaches are genuinely viable, describe each in two lines and recommend one with the reason. Otherwise, present one approach. Do not list options you would not choose.
4. **Break into steps.** Each step changes a small set of files, leaves the codebase in a working state, and states how it will be verified: a test, a command, or an observable behavior. Order steps so the riskiest unknown is retired first.
5. **List risks and open questions.** Separate what blocks starting from what can be decided during implementation.
6. **Write the plan** to `docs/plans/<yyyy-mm-dd>-<slug>.md` using the template below. Summarize it in three to five lines in the reply, then stop. Implementation starts only after the user approves.

## Rules

- Proof-of-concept bias: the smallest change that proves the point. Name what is deliberately throwaway so nobody hardens it later by accident.
- Prefer existing patterns over new abstractions. Introduce an abstraction only when the plan shows it being used in three places.
- Every step has a verification. "It should work" is not one.
- Omit template sections that have nothing in them. Do not pad.
- Plans are living documents. When implementation diverges from the plan, update the plan file rather than leaving it stale.
- For UI work, the plan names the screens and states to build. Visual decisions follow the frontend-design skill and are not restated here.

## Template

```markdown
# <Title>

**Goal:** <one or two sentences, including what done looks like>
**Out of scope:** <bullets>

## Context
<What exists today that this builds on. Patterns to reuse. Constraints discovered while exploring.>

## Approach
<The chosen approach and why. Alternatives considered, if any, in one line each.>

## Steps
1. <Step> - files: `a.ts`, `b.ts` - verify: <how>
2. ...

## Risks and open questions
- **Blocks start:** ...
- **Decide during implementation:** ...

## Throwaway
<Parts that are deliberately POC-grade and should not be hardened.>
```

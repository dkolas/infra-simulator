---
name: review
description: Reviews code for quality issues - correctness, structure, readability, consistency with project conventions and the implementation plan, and test coverage. Use when the user asks to review, critique, audit, or check code, a diff, a feature, or a file, or after an implementation step is finished. Produces verified, severity-ranked findings, not a style pass.
argument-hint: "[diff | path | plan file]"
allowed-tools: Bash(git diff *) Bash(git status *) Bash(git log *)
---

# Review code for quality

Scope: $ARGUMENTS

## Uncommitted changes

!`git status --short 2>/dev/null || true`

## Process

1. **Fix the scope.** If none was given, review the uncommitted changes above. If there are none either, ask what to review. If a matching plan exists in `docs/plans/`, read it and review against it.
2. **Read the code in full**, not only the changed hunks. Understand what the code is for before judging how it is built.
3. **Look in this order:** correctness, design, readability, consistency, tests. Stop looking for lower-priority classes once a blocker is found in a file, and say so.
4. **Verify every candidate finding** against the actual code before reporting it: trace the call path, confirm the input really can be empty or null, run the test. Drop anything that cannot be confirmed, or mark it explicitly as unverified.
5. **Report** using the output format below.

## What to look for

- **Correctness:** edge cases (empty, null, boundaries, concurrent updates), unhandled error paths, resource cleanup, wrong assumptions about data shape, silent failures.
- **Design:** mixed responsibilities, wrong level of abstraction, duplication that will diverge, coupling that will make the next iteration painful, abstraction with a single user.
- **Readability:** names that lie or say nothing, functions too long to hold in one's head, comments that restate the code instead of explaining why, dead code.
- **Consistency:** deviation from existing conventions or from the plan without a stated reason, a new dependency for something already available.
- **Tests:** is the behavior covered, or only the lines? Tests that assert implementation details. Missing negative cases. Tests that cannot fail.
- **UI code:** apply the checklist in the frontend-design skill (`ui-checklist.md`).
- **Security and performance:** only where realistic for this proof of concept: secrets in code, injection, unbounded work on user-controlled input, N+1 patterns on hot paths.

## Rules

- Fewer verified findings beat many speculative ones. Skip anything a formatter or linter would catch.
- Every finding gives file and line, what is wrong, why it matters here, and a concrete fix.
- Severity levels:
  - **blocker**: wrong behavior, data loss, or security exposure.
  - **should-fix**: costs more to fix later than now.
  - **consider**: a judgment call; state the trade-off.
  - **praise**: something worth repeating elsewhere.
- Do not demand production hardening from a proof of concept. Ask instead: does this block the POC's goal, or make the next iteration painful?
- Do not fix during review. Report, then fix only when asked.
- When the code is good, say so plainly and briefly.

## Output format

```markdown
## Review: <scope>

**What it does:** <one or two sentences>
**Verdict:** <ready | ready after should-fixes | needs work>

### Findings
1. **[blocker]** `path/file.ts:42` - <what is wrong>. <Why it matters>. Fix: <concrete change>.
2. **[should-fix]** ...
3. **[consider]** ...

### Praise
- ...

### Not checked
- <anything out of scope or unverifiable, in one line each>
```

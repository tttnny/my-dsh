---
name: implement-spec
description: "Implement the result of /to-spec and /to-tickets in code."
disable-model-invocation: true
---

You have been provided a spec. This spec should have tickets associated with it, describing how to implement the spec.

The issue tracker should have been provided to you. If not, tell the user to run `/setup-matt-pocock-skills`.

The goal is the entire spec implemented on a single **integration branch**, with every ticket resolved the way the issue tracker closes work.

The tickets are not a list of steps. They are a **task graph** with blocking relationships between them. This means there is always a **frontier** of tickets which are ready to be grabbed.

A ticket gets its worktree when it joins the frontier, cut from the integration branch tip of that moment. A blocked ticket holds no worktree: a base cut before its blockers landed is already behind by the time it starts, and turns a merge that should be a fast-forward into a conflict resolution.

Start every subagent with `subagent`, never `subagent_fork`: a fork inherits this conversation's completed turns, which is the context a worker was meant to start without.
Communication to and from subagents should be sparse. Communicate primarily through **context pointers**: to the spec, tickets, research notes, and previous commits. Don't duplicate information already available via pointers.

**Implementer subagents** run in the background without being asked, so issue their spawns in one message and then stop working. Each completion notice starts a new turn for you, which keeps concurrency at the graph's maximum.

## Steps

1. Read the spec and tickets to understand the task graph.

2. (optional) Use an **exploration subagent** to conduct any exploration required by the tickets - relevant codebase files or external documentation. Ensure the exploration subagent can save files - it should save its markdown notes in a directory outside the repo, accessible by all future subagents. This lets **implementer subagents** focus on implementation rather than exploration. **When you take this step, its notes gate the run: no implementer starts until the exploration subagent has reported back and the notes exist.**

3. Create the integration branch. If the issue tracker closes work through PRs, or the user asks for one, open a draft PR after the first merge in step 6 (a branch with no commits ahead of main can't open one), marked as closing the spec and tickets.

4. Staff the **frontier**: for each ready ticket, and only for those, use a fresh **implementer subagent**, create the worktree and branch from that commit, and spawn it with `cwd` set to that worktree, so `read`, `edit` and `write` land there along with `bash`. If step 2 was taken, don't start any of this until the exploration notes exist. Each implementer subagent:
   - confirms its worktree is based on the integration branch tip it was handed, and resets onto it if not;
   - calls the Skill tool with `tdd` to build the ticket;
   - merges the integration branch tip into its own branch before reporting done

5. Create the **dedicated merger subagent** once, before the first merge, and give it every finished branch to merge for the rest of the run, rather than a new merger per branch. One merger for the whole run keeps merge standards consistent, and creating it before the first merge means no merge waits on a subagent being spawned.

6. The moment an **implementer subagent** reports, send its branch to the **dedicated merger subagent**, ahead of whatever else you were about to do. A report left sitting holds back every ticket blocked behind it and widens the gap between that worktree's base and the integration branch. Once the merge lands, re-read the **frontier** and the integration branch tip, then staff each newly ready ticket as in step 4, so concurrency stays at the graph's maximum.

An implementer that has gone the wrong way keeps its history: `interrupt_agent` stops its turn, and `send_message` redirects it. That is cheaper than respawning, which pays for the reading again.

7. Once all tickets are complete, call the Skill tool with `code-review` on the integration branch. Fix all issues raised by the code review in a single fresh **implementer subagent**.

8. If a draft PR exists, mark it ready for review. Otherwise, resolve each ticket the way the issue tracker closes work, and report the integration branch.

9. Clean up all **implementer subagent** worktrees.

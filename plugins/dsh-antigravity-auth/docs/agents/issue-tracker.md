# Issue Tracker Configuration

## Canonical tracker

- Provider: GitHub Issues
- Repository: `suntianc/dsh-antigravity-auth`
- Repository URL: `https://github.com/suntianc/dsh-antigravity-auth`
- Issue URL prefix: `https://github.com/suntianc/dsh-antigravity-auth/issues/`
- Canonical Git origin: `git@github.com:suntianc/dsh-antigravity-auth.git`
- Triage label for implementable tickets: `ready-for-agent`
- Parent implementation specification: issue `#1`

This is a private repository. Reading or writing its tracker requires the authenticated GitHub account to have access.

## Reference normalization

Within a command that explicitly targets `dsh-antigravity-auth`:

- `#2` means GitHub issue 2 in `suntianc/dsh-antigravity-auth`.
- `#issue2` is accepted as an alias for `#2`.
- A full URL is accepted only if its owner/repository is exactly `suntianc/dsh-antigravity-auth`.
- A bare number is not sufficient at workspace scope.

Never resolve a reference against another repository merely because the issue body mentions another package or DSH core.

## Required fetch procedure

Before implementing or reviewing an issue:

1. Verify the local project root and canonical `origin` defined in the project `AGENTS.md`.
2. Fetch the issue body, labels, state, and all comments from `suntianc/dsh-antigravity-auth`.
3. Follow its `## Parent` reference and read the parent issue body without modifying or closing it unless the user explicitly requests a spec correction.
4. Read the matching local spec/research documents and compare them with the tracker body.
5. If the issue, parent spec, local docs, and project `AGENTS.md` disagree about repository scope, stop before editing and report the conflict.

Example read command:

```text
gh issue view 2 --repo suntianc/dsh-antigravity-auth --json number,title,state,labels,body,comments
```

## Command forms

```text
/implement dsh-antigravity-auth #issue2
/code-review dsh-antigravity-auth main #issue2
/to-tickets dsh-antigravity-auth #issue1
```

- `/implement` uses the issue as the implementation contract and may modify only the registered plugin repository.
- `/code-review` uses the explicit fixed point for `git diff <fixed-point>...HEAD` and the issue as the Spec axis source.
- `/to-tickets` publishes child issues to this tracker and references the parent without closing it.

## Scope guard

- Issues in this tracker authorize only `dsh-antigravity-auth` work.
- They do not authorize commits to DeepSeek Harness, another plugin, an installed package, a user profile, or a live deployment.
- A genuine cross-repository requirement must be stopped and separately specified, approved, and targeted by a new explicit command.
- Issue `#2` is specifically plugin-only. Its Wire Identity implementation must remain in this repository; prior DSH core experiments are not valid implementations of that ticket.
- Issue `#5` is implemented at `dbc8783`, Issue `#17` at `efa4aaa`, and the capability series through Issue `#16` is implemented on `main`. Later repairs do not reopen or expand completed Issue `#3`.

## External-action guard

Issue implementation does not implicitly authorize commit, push, merge, release, npm publication, repository visibility changes, live-profile installation, or live OAuth/private endpoint calls. Each requires the user's separate explicit request.

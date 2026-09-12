# DSH `0.1.1-rc.2` plugin impact assessment

## Scope

This assessment covers the upgrade of `dsh-antigravity-auth` from the DSH
`0.1.1-rc.1` development baseline to `0.1.1-rc.2`.

Upstream comparison:

- previous tag: [`dsh-v0.1.1-rc.1`](https://github.com/deepseek-ai/deepseek-harness/tree/528c682e061696f5a160f363f236ecbf53cbd006)
- target tag: [`dsh-v0.1.1-rc.2`](https://github.com/deepseek-ai/deepseek-harness/tree/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e)
- complete diff: [`dsh-v0.1.1-rc.1...dsh-v0.1.1-rc.2`](https://github.com/deepseek-ai/deepseek-harness/compare/dsh-v0.1.1-rc.1...dsh-v0.1.1-rc.2)

No live OAuth, private Antigravity endpoint, browser profile, or Windows runtime
was used for this assessment.

## Upstream changes that matter here

- DSH now normalizes durable images and derives deterministic, model-specific
  request variants. `ImageAttachmentRef` gains optional `originalDimensions`,
  while `AttachmentStore` gains request-image policy types and a default-rejecting
  `readImageRequest()` extension point.
- `LlmAdapter` gains a compatible default `prepareCall()` implementation and
  prepared calls carry input modalities. Existing adapters that implement
  `resolveModel()` and `stream()` remain valid and receive DSH's text-model image
  projection through the default preparation path.
- The stock DeepSeek adapter can upload and reuse images through its Files API,
  with bounded inline fallback. This behavior belongs to that adapter and does
  not replace Antigravity's plugin-owned transport.
- Existing `AttachmentStore.saveImage()` and `readImage()` signatures are
  unchanged. New local-store writes may nevertheless be resized, transcoded,
  stripped of metadata, and assigned a different content-addressed identity.
- The removed session blank-reuse option and other permission-preset rollback
  details are not consumed by this plugin.

## Plugin compatibility

The plugin continues to use the supported public seams:

- `LlmAdapter`, `ctx.llm`, `HarnessError`, retry policy, and
  `attributionHeaders()`;
- `AttachmentStore.saveImage()` / `readImage()`;
- Host settings, client injection, typed loopback RPC, Cordis patching, tools,
  filesystem, session, and web provider services.

No source migration is required for those interfaces. Antigravity does not gain
DeepSeek Files API behavior automatically and intentionally continues to encode
verified `readImage()` bytes through its private transport. The rc.2 local
attachment implementation can change persisted image bytes and dimensions, so
real-image regression remains a separate live/runtime verification boundary.

## Dependency decision

- Direct DSH peers use `^0.1.1-rc.2`.
- Development DSH dependencies use exact `0.1.1-rc.2` versions.
- The minimum-release-age exclusions and lockfile resolve one coherent rc.2 DSH
  graph with no rc.1/rc.2 mixing.
- Non-DSH package resolutions were retained while regenerating the DSH portion
  of the lockfile.

## Offline verification

The upgraded graph passed:

```text
pnpm install --frozen-lockfile
pnpm peers check
pnpm run check
```

`pnpm run check` completed peer validation, lint, Host/client typechecking,
23 test files with 170 passing tests, Host/client builds, package smoke, and
`publint`.

## Result

The rc.2 baseline is compatible with the plugin's current public DSH seams and
can be adopted without changing Antigravity runtime code. Live profile behavior,
real image normalization, Windows filesystem behavior, OAuth, and private
endpoint availability were not verified by the offline gate.

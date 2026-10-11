# 自建 LLM 适配器的 usage 映射

把 provider 的 usage 映射成 `TokenUsage` 时读这一份。

`TokenUsage` 的 `inputTokens` 只含**未命中缓存**的输入，命中量与写入量分别走 `cacheReadTokens` / `cacheWriteTokens`，计费输入 = 三者之和（定义原文见 `@deepseek-ai/dsh-llm` 的 `TokenUsage` 注释）。

## 当场减掉缓存

provider 把缓存折进一个 prompt 总数时（`prompt_tokens`、`usageMetadata.promptTokenCount`）**必须在适配器里当场减掉**、负数夹到 0——漏减不报错，只静默夸大未命中量、稀释命中率。参照实现：`@deepseek-ai/dsh-llm-deepseek` 的 `mapUsage`。

`totalTokens` 只照抄 provider 给的权威总数，给不出就省略；provider 不单独计缓存写入费时，不填 `cacheWriteTokens` 即正确状态。

## 断言判据

usage 断言样例的判别力来自缓存字段：只给 prompt / candidates 的样例解不出漏减，跑绿也测不到东西。范例：`@deepseek-ai/dsh-llm-deepseek` 的 `tests/stream.spec.ts`「emits first-seen blocks, raw tool JSON and cumulative disjoint usage before finish」那条——缓存折进 prompt 总数时，`inputTokens` 与 `cacheReadTokens` / `cacheWriteTokens` 三个字段互不重叠，`totalTokens` 另照抄 provider 给的权威值。

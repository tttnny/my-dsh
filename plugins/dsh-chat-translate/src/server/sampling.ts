/**
 * 采样参数：Hy-MT2-1.8B 的官方推荐值。
 *
 * 只发标准参数。官方推荐里还有 `top_k 20` 与 `repetition_penalty 1.05`，
 * 它们是 vLLM 系服务的扩展，严格的 OpenAI 兼容端点收到会直接 400，所以不随
 * 请求发出；用自建服务的人可以照这两个值在自己的服务上配。
 *
 * 同一段原文今天翻两次可能不一样，但同一段只翻一次（译文池按原文内容命中），
 * 所以差异只出现在不同段落之间。
 */
export const SAMPLING_TEMPERATURE = 0.7;
export const SAMPLING_TOP_P = 0.6;

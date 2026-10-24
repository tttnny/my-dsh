/**
 * 结论步骤的判据：这一行正文要不要送译。
 *
 * 一轮回答里，前面几步在干活（读文件、跑命令），最后一步把结论交给读者。前者
 * 的散文往往是英文，要翻；后者由模型直接写给读者，通常是已经写好的中文，再送
 * 一遍模型只换来等待与改坏的风险。所以**结论步骤的正文一律不送译**：它按原文
 * 呈现，左缘不出现任何东西（没有窄带、没有 ↻、不报「设置没配好」）——与总开关
 * 关着时一样，是纯粹的「这里不翻译」，不是失败。
 *
 * 「哪一步是结论」的权威信号来自宿主。`TurnProcessSpec.answerStep`
 * （`packages/client/ui-chat/src/client/conversation-nodes/turn-process.ts`）取本轮
 * 最后一个 step，要求它带着 `finalNode`（消息已落定）、有正文、且**不含
 * tool-call**。这个字段在流式期间是 null，插件因此要自己补上「还没落定」那一段
 * 的判断——下面 3、4 两档复刻的就是宿主那三条条件，宿主改动时由
 * `scripts/test-host-parity.mjs` 里钉 `latestAnswer()` 的那条断言报出来。判定按
 * 从严到宽分档：
 *
 * 1. `answerStep` 有值：直接用，它是宿主的权威答案。
 * 2. 没有轮次投影（`answerStep === undefined`）：判不了就是判不了，一律照旧送译
 *    ——宁可多翻一段，也不能因为拿不到投影就把整段正文悄悄关掉。
 * 3. `answerStep` 是 null（本轮还没有落定的消息）：若已知本轮的 step 序列，而这
 *    一行不是最后一个 step，就肯定不是结论——后面还有一步要走。
 * 4. 剩下的就是「可能成为结论」。带 tool-call 的 step 按宿主判据永远成不了结论，
 *    可以当场送译；还在写、又只有正文的行先按结论处理：先译再撤会让读者眼前的
 *    中文闪回原文。
 *
 * 第四档是唯一的取舍：一个只有正文、没有 tool-call 的过程步骤（例如「我先看一眼
 * 实现」）会等到下一步开始时才送译。这是为了让结论行从第一帧起就是原文。
 */
import type { AssistantBlockLike } from './row-plan.ts';

/**
 * 宿主 `hasAssistantReplyContent` 的镜像：这一行的块里有没有读者看得见的正文
 * （思考块与工具行不算，空 text 也不算）。
 *
 * @param blocks - 行的块清单。
 * @returns 有正文则为 true。
 */
function hasReplyContent(blocks: readonly AssistantBlockLike[]): boolean {
  return blocks.some((block) => {
    if (block.kind === 'reasoning' || block.kind === 'tool-call') return false;
    if (block.kind === 'text') return (block.text ?? '').trim() !== '';
    return true;
  });
}

/**
 * 这一行有没有 tool-call 块：按宿主的判据，带工具调用的 step 永远不是结论步骤。
 *
 * @param blocks - 行的块清单。
 * @returns 有工具调用则为 true。
 */
function hasToolCall(blocks: readonly AssistantBlockLike[]): boolean {
  return blocks.some((block) => block.kind === 'tool-call');
}

/** {@link isConclusionRow} 的输入。 */
export interface ConclusionInput {
  /** 行状态：`running` 还在写，`settled` 已落定，`interrupted` 被中断。 */
  status: 'running' | 'settled' | 'interrupted';
  /** 这一行所属的 step 号。 */
  step: number;
  /** 行的块清单。 */
  blocks: readonly AssistantBlockLike[];
  /**
   * 宿主算出的结论步骤号（`TurnProcessSpec.answerStep`）；`null` = 本轮还没有
   * 落定的消息，宿主暂时给不出这个答案；`undefined` = 这一行没拿到轮次投影。
   */
  answerStep?: number | null | undefined;
  /**
   * 本轮各 step 的号，升序；缺省 = 不知道本轮还有没有后面的 step。只需要号，
   * 不读每一步的数据。
   */
  turnSteps?: readonly number[] | undefined;
}

/**
 * 这一行是不是本轮结论步骤的正文。
 *
 * @param input - 行状态、step、块清单，以及宿主的结论步骤号。
 * @returns 是结论步骤则为 true（正文不送译）。
 */
export function isConclusionRow(input: ConclusionInput): boolean {
  const { status, step, blocks, answerStep, turnSteps } = input;

  // 1. 宿主已经判定了：它是权威，直接用。
  if (answerStep !== null && answerStep !== undefined) return answerStep === step;

  // 2. 没有轮次投影：判不了，照旧送译。关掉翻译必须基于一个说得出的判据。
  if (answerStep === undefined) return false;

  // 3. 后面还有一步要走：这一行肯定不是结论。
  const lastStep = turnSteps?.[turnSteps.length - 1];
  if (lastStep !== undefined && lastStep !== step) return false;

  // 4. 可能成为结论。带 tool-call 的 step 永远成不了结论，可以当场送译；
  //    纯正文的行先按结论对待，别再译一遍再撤回来。
  if (status === 'running') return !hasToolCall(blocks);

  // 5. 已落定（含中断）：宿主判据的镜像——最后一步、有正文、不含工具调用。
  return hasReplyContent(blocks) && !hasToolCall(blocks);
}

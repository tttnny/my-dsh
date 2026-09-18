// src/host/bootstrap.js —— 启动期技能名单装配（H1 #445 从 host/index.js 搬出）。
// 以后谁改它：改技能名单惰性加载的人。
// 接线：由 index.js 动态 import 加载；本文件不引用其他新文件。
// 分叉整改：原 bundled 兜底 provider 已删除——候选目录不存在，且技能实际经 agent-preset 分发（presets/matt-*/skills/）。
export function createBootstrap() {
  // 技能名单（#280 单一真源：与 check-catalog + client SKILLS 同步；拼写以真实目录为准，B 语义由 skills.get 覆盖）
  // 真源 = shared/matt-skills.js（MATT_SKILL_PROBE_NAMES）。本字段由 getMattSkillProbeNames() 惰性加载。
  let SKILL_PROBE_NAMES = null
  async function getMattSkillProbeNames() {
    if (SKILL_PROBE_NAMES) return SKILL_PROBE_NAMES
    try {
      const m = await import('../shared/matt-skills.js')
      SKILL_PROBE_NAMES = (m && (m.MATT_SKILL_PROBE_NAMES || m.default?.MATT_SKILL_PROBE_NAMES)) || null
      if (!SKILL_PROBE_NAMES) throw new Error('shared/matt-skills.js 未导出 MATT_SKILL_PROBE_NAMES')
    } catch (e) {
      // 兜底：内联一份与真源一致的常量（仅在 shared 文件丢失时使用；CI/构建必须保证真源在场）
      SKILL_PROBE_NAMES = ['ask-matt','code-review','codebase-design','diagnosing-bugs','domain-modeling','grill-with-docs','implement','improve-codebase-architecture','prototype','research','resolving-merge-conflicts','setup-matt-pocock-skills','tdd','to-spec','to-tickets','triage','wayfinder','wizard','grill-me','grilling','handoff','teach','to-questionnaire','wait-what','writing-for-agents']
    }
    return SKILL_PROBE_NAMES
  }
  return { getMattSkillProbeNames }
}

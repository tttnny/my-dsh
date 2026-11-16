// 随包技能的单测：frontmatter 子集、三份正文的必现句子、provider 的候选与取回。
//
// 直接打 src/ 的源码（不读构建产物）；宿主注册表里的 rank 覆盖由 scripts/smoke-host.mjs
// 用真 SkillRegistry 断言，这里只守「文件读得出来、正文没漂、候选形状对」。
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  SKILL_NAMES,
  SKILL_PROVIDER_NAME,
  SKILL_RANK,
  SKILL_SOURCE,
  createSkillProvider,
  loadSkills,
  parseSkillMarkdown,
} from '../src/skill-provider.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

let passed = 0;
const failures = [];
async function test(name, fn) {
  try {
    await fn();
    console.log('  ✓ [PASS] ' + name);
    passed++;
  } catch (err) {
    console.error('  ✗ [FAIL] ' + name + ': ' + err.message);
    failures.push(name);
  }
}

/** 拼一份最小 frontmatter，正文固定一行。 */
function frontmatter(fields) {
  return '---\n' + fields + '\n---\n\nbody line\n';
}

await test('解析：带引号的 description 走 JSON，正文去掉 frontmatter', () => {
  const parsed = parseSkillMarkdown(frontmatter('name: demo\ndescription: "a \\"quoted\\" value"'), 'demo/SKILL.md');
  assert.equal(parsed.name, 'demo');
  assert.equal(parsed.description, 'a "quoted" value');
  assert.equal(parsed.content, 'body line');
  assert.deepEqual(parsed.invocation, { modelInvocable: true, userInvocable: true });
});

await test('解析：不带引号的 description 取整行，单引号不影响', () => {
  const parsed = parseSkillMarkdown(frontmatter("name: demo\ndescription: plain text with 'quotes'"), 'demo/SKILL.md');
  assert.equal(parsed.description, "plain text with 'quotes'");
});

await test('解析：CRLF 与空行都认', () => {
  const parsed = parseSkillMarkdown('---\r\nname: demo\r\ndescription: "x"\r\n\r\n---\r\n\r\nbody\r\n', 'demo/SKILL.md');
  assert.equal(parsed.name, 'demo');
  assert.equal(parsed.content, 'body');
});

await test('解析：disable-model-invocation 认 true 与 yes，user-invocable 认 false', () => {
  assert.equal(parseSkillMarkdown(frontmatter('name: demo\ndescription: x\ndisable-model-invocation: true'), 'x').invocation.modelInvocable, false);
  assert.equal(parseSkillMarkdown(frontmatter('name: demo\ndescription: x\ndisable-model-invocation: yes'), 'x').invocation.modelInvocable, false);
  assert.equal(parseSkillMarkdown(frontmatter('name: demo\ndescription: x\nuser-invocable: false'), 'x').invocation.userInvocable, false);
});

await test('解析：缺 frontmatter、缺 description、非法 name 各自抛错', () => {
  assert.throws(() => parseSkillMarkdown('no frontmatter', 'x/SKILL.md'), /missing YAML frontmatter/);
  assert.throws(() => parseSkillMarkdown('---\nname: demo\n---\nbody', 'x/SKILL.md'), /requires a description/);
  assert.throws(() => parseSkillMarkdown(frontmatter('name: Demo\ndescription: x'), 'x/SKILL.md'), /kebab-case/);
  assert.throws(() => parseSkillMarkdown(frontmatter('name: demo\ndescription: x\ndisable-model-invocation: maybe'), 'x/SKILL.md'), /must be a boolean/);
});

const definitions = loadSkills();

await test('随包三份技能都在，名字、来源、资源目录与路径都对', () => {
  assert.deepEqual([...definitions.keys()], SKILL_NAMES);
  for (const name of SKILL_NAMES) {
    const definition = definitions.get(name);
    assert.equal(definition.name, name);
    assert.ok(definition.description.length > 0);
    assert.equal(definition.provider, SKILL_PROVIDER_NAME);
    assert.equal(definition.source, SKILL_SOURCE);
    assert.equal(definition.resourceBase.kind, 'directory');
    assert.ok(definition.resourceBase.path.endsWith('/skills'));
    assert.ok(definition.path.endsWith(join(name, 'SKILL.md')));
    assert.ok(existsSync(definition.path));
    assert.equal(definition.content.includes('---\nname:'), false);
    assert.equal(definition.content, definition.content.trim());
  }
});

await test('调用策略照 frontmatter：implement-spec 只给用户调，另两个模型可调', () => {
  assert.equal(definitions.get('implement-spec').invocation.modelInvocable, false);
  assert.equal(definitions.get('implement-spec').invocation.userInvocable, true);
  assert.equal(definitions.get('grilling').invocation.modelInvocable, true);
  assert.equal(definitions.get('code-review').invocation.modelInvocable, true);
});

await test('正文带着适配与增强：grilling 的表单轮与收工条件', () => {
  const content = definitions.get('grilling').content;
  assert.match(content, /grilling_form/);
  assert.match(content, /every sub-agent this session dispatched has reported/);
});

await test('正文带着适配与增强：implement-spec 的 subagent、cwd、纠偏与 frontier/merger', () => {
  const content = definitions.get('implement-spec').content;
  assert.match(content, /subagent_fork/);
  assert.match(content, /\`cwd\`/);
  assert.match(content, /interrupt_agent/);
  assert.match(content, /A ticket gets its worktree when it joins the frontier/);
  assert.match(content, /dedicated merger subagent/);
  assert.match(content, /exploration notes/);
});

await test('正文带着适配与增强：code-review 的命名、纠偏与两处只读约束', () => {
  const content = definitions.get('code-review').content;
  assert.match(content, /standards-review/);
  assert.match(content, /interrupt_agent/);
  assert.equal(content.match(/Review only: do not modify the working tree or create commits\./g).length, 2);
});

await test('provider：三个候选 rank 为 SKILL_RANK，get 取回同一份定义', async () => {
  const provider = createSkillProvider(definitions);
  assert.equal(provider.name, SKILL_PROVIDER_NAME);
  const candidates = await provider.list();
  assert.equal(candidates.length, 3);
  for (const [index, candidate] of candidates.entries()) {
    assert.equal(candidate.name, SKILL_NAMES[index]);
    assert.equal(candidate.rank, SKILL_RANK);
    assert.equal(candidate.provider, SKILL_PROVIDER_NAME);
    assert.equal(candidate.source, SKILL_SOURCE);
    assert.equal(candidate.locator, candidate.name);
    assert.equal(await provider.get(candidate), definitions.get(candidate.name));
  }
  assert.equal(await provider.get({ locator: 'nope' }), undefined);
});

console.log(passed + '/' + (passed + failures.length) + ' passed');
process.exitCode = failures.length === 0 ? 0 : 1;

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

test('环境诊断只显示 HTTP origin，错误输出不带启动凭据', () => {
  const root = join(import.meta.dirname, '..');
  const temp = join(root, 'tmp');
  mkdirSync(temp, { recursive: true });
  const fixture = mkdtempSync(join(temp, 'dsh-env-test-'));
  try {
    const launcher = join(fixture, 'launcher');
    const kernel = join(launcher, 'versions/1.2.3/node_modules/@deepseek-ai/dsh');
    mkdirSync(kernel, { recursive: true });
    writeFileSync(join(kernel, 'package.json'), JSON.stringify({ version: '1.2.3' }));
    const origin = 'https://127.0.0.1:3088';
    const secrets = ['fixture-user', 'fixture-password', 'fixture-query', 'fixture-fragment', 'fixture-malformed', 'fixture-non-http', 'fixture-path'];
    writeFileSync(join(launcher, 'running.json'), JSON.stringify({
      valid: { profile: 'web', url: 'https://fixture-user:fixture-password@127.0.0.1:3088/fixture-path?token=fixture-query#fixture-fragment' },
      malformed: { profile: 'web', url: 'not a URL?token=fixture-malformed' },
      nonHttp: { profile: 'web', url: 'file:///fixture-non-http' },
    }));

    function run(...args) {
      const result = spawnSync(process.execPath, [join(root, 'tools/dsh-env.mjs'), ...args], {
        cwd: root,
        env: { ...process.env, DSH_LAUNCHER_DIR: launcher, DSH_HOME: join(fixture, 'home'), DSH_PROFILE: 'web', DSH_KERNEL_VERSION: '1.2.3' },
        encoding: 'utf8',
      });
      assert.ifError(result.error);
      for (const channel of ['stdout', 'stderr']) {
        assert.ok(secrets.every((secret) => !result[channel].includes(secret)), `诊断凭据出现在 ${channel}`);
      }
      return result;
    }

    const text = run();
    assert.equal(text.status, 0);
    assert.ok(text.stdout.includes(origin), '普通输出包含 origin');
    assert.equal(text.stdout.match(/没有 HTTP 地址/g)?.length, 2);

    const json = run('--json');
    assert.equal(json.status, 0);
    assert.deepEqual(JSON.parse(json.stdout).running.map((instance) => instance.url), [origin, null, null]);

    const error = run('--dsh', '9.9.9');
    assert.equal(error.status, 1);
    assert.match(error.stderr, /内核 9.9.9 没有安装/);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

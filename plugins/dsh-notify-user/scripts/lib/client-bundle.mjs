/**
 * 按 Web shell 的方式装载 lib/client.js：`window.__ModuleLoader__` 桩件 + 平台模块表。
 * 两个客户端自检共用这一份，模块表只写一遍。
 */
import { createRequire } from 'node:module';
import { join } from 'node:path';

const require = createRequire(import.meta.url);

/** ui-primitives 的薄桩：只顶掉 bundle 真的 require 的那几个名字。 */
const primitives = {
  IconChevronDownOutlineRegular: () => null,
  Input: () => null,
  MarkdownDelegateProvider: (props) => props.children,
  MarkdownText: (props) => props.text,
  Switch: () => null,
  TextShimmer: (props) => props.children,
};

/**
 * 装载浏览器 bundle。
 * @param root - 包根目录。
 * @returns bundle 的导出与它 require 过的模块 id。
 */
export async function loadClientBundle(root) {
  let exported;
  const requires = [];
  globalThis.window = {
    __ModuleLoader__: {
      load: ({ id, factory }) => {
        requires.push(id);
        exported = factory((spec) => {
          if (spec === 'react') return require('react');
          if (spec === 'react/jsx-runtime') return require('react/jsx-runtime');
          if (spec === 'react-dom') return require('react-dom');
          if (spec === '@deepseek-ai/dsh-client-ui-primitives') return primitives;
          throw new Error('module table miss: ' + spec);
        });
      },
    },
  };
  await import(join(root, 'lib/client.js') + '?bundle=' + Date.now());
  return { exported, requires };
}

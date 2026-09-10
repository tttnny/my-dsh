import { defineConfig } from "tsdown";

const PLUGIN_ID = "@lynn123411/dsh-oil-sticky-prompt";

export default defineConfig([
  {
    name: `${PLUGIN_ID}/host`,
    entry: { index: "src/index.ts" },
    outDir: "lib",
    format: "esm",
    platform: "node",
    target: "es2024",
    fixedExtension: false,
    dts: true,
    clean: false,
  },
  {
    name: `${PLUGIN_ID}/client`,
    entry: { client: "src/client/index.tsx" },
    outDir: "lib",
    format: "cjs",
    platform: "browser",
    target: "es2022",
    fixedExtension: false,
    // 客户端半区是 window.__ModuleLoader__ 工厂包：tsdown 在自定义 entryFileNames 下
    // 只会吐出 client.ts.map 而没有 .d.ts（实测 0.22.14），因此保持 dts: false。
    dts: false,
    sourcemap: true,
    clean: false,
    // 纯 DOM 插件：无运行时外部依赖，全部打包进 client.js。
    outputOptions: {
      entryFileNames: "client.js",
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PLUGIN_ID)}, factory: (require) => {`,
      intro: "var module = { exports: {} }; var exports = module.exports;",
      footer: "return module.exports; } });",
    },
  },
]);

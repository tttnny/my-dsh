/**
 * `node:os` 的最小环境声明：本插件只需 networkInterfaces()，不引入 @types/node
 * （保持零新增依赖，构建期 esbuild 仍按 node 内建模块处理，不打包）。
 */
declare module 'node:os' {
  /** 单个网卡地址条目（只声明本插件用到的字段）。 */
  interface NetworkInterfaceInfo {
    address: string;
    family: string;
    internal: boolean;
  }
  /** 按网卡名分组的地址表。 */
  function networkInterfaces(): Record<string, NetworkInterfaceInfo[]>;
}

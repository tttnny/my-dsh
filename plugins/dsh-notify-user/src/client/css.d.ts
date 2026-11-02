/** 样式表在构建期被读成字符串（见 build.mjs 的 dsh-css-text），所以 `.css` 的默认导出是文本。 */
declare module '*.css' {
  const css: string;
  export default css;
}

/** `?inline` 导入的样式表是构建期内联进来的字符串，不是要交给打包器处理的 CSS 模块。 */
declare module '*.css?inline' {
  const css: string;
  export default css;
}

declare module '*.woff2?datauri' {
  const value: string;
  export default value;
}

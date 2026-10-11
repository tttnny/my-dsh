// 非 JS 资源的类型声明。
//
// 构建侧（build.mjs 的 `dsh-css-text` 插件）把 .css 读成字符串导出，所以这里声明的也是
// 「默认导出是一个字符串」——声明必须跟着构建走，写成别的形状就是给类型系统编一个
// 运行时不存在的模块。
declare module '*.css' {
  const content: string;
  export default content;
}

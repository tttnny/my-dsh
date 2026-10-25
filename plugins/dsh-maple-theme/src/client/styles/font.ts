/**
 * Maple 的内嵌字体：正文与界面都用 maplemono。
 *
 * Maple 把整个界面的字族都换成这一个内嵌字体，观感的一大半来自这里。
 * 两个字体面（正常 / 斜体）按 data URI 内联进客户端 bundle：插件在 registry 上的
 * 实际路径是装的时候才知道的，另发字体文件就得拼一个自己不可能知道的 URL。
 */
import regular from './fonts/maplemono.woff2?datauri';
import italic from './fonts/maplemono-italic.woff2?datauri';

/** 字体族名：与 Maple 主题里的名字一致，便于认出来源。 */
const FAMILY = 'maplemono';

/**
 * 拼出 `@font-face` 与字族声明。
 *
 * 字族声明与宿主同形（都落在 body 上），再加一个属性提一级优先级：宿主 base.css 的
 * body 也定义了这两个变量，同优先级下先写的那份赢。
 *
 * 用户的字体偏好排在最前——用户显式选过的字族不该被主题盖掉，主题只提供默认值。
 */
export function fontCss(): string {
  return `
@font-face {
  font-family: '${FAMILY}';
  font-style: normal;
  font-display: swap;
  src: url(${regular}) format('woff2');
}

@font-face {
  font-family: '${FAMILY}';
  font-style: italic;
  font-display: swap;
  src: url(${italic}) format('woff2');
}

html[data-maple-theme='on'][data-maple-font='on'] body {
  --dsw-font-family: var(--dsh-font-family-text, '${FAMILY}'), '${FAMILY}',
    var(--dsh-font-family-text-default);
  --ds-font-family-code: var(--dsh-font-family-code, '${FAMILY}'), '${FAMILY}',
    var(--dsh-font-family-code-default);
}
`;
}

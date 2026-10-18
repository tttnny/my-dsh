/**
 * 预览用的 ui-primitives 替身。
 *
 * 真的那个包在自己 lib/index.js 里把整个组件库（模态、shiki 代码高亮、simple-icons、
 * katex……）塞成一个文件，那些重依赖本仓库没装，打不进预览页。所以这里替换成几个薄壳，
 * **样式仍然用宿主真实的 CSS 文件**（见 `tools/ui-preview.mjs` 里的 hostSheets），渲染
 * 出来的类名与真实组件一致，于是字距、行高、markdown 段落间距、Tag 的外观都是真的。
 *
 * 只服务 `tools/ui-preview.mjs`，不进任何包。
 *
 * **插件新引一个名字就要在这里补一个**：这里没有而插件引了的，那一处就是 `undefined`——
 * React 只打一行 warning，预览页上会静默少一整块。
 */
import { createElement } from 'react';

const classOf = {
  markdown: 'markdown',
  compact: 'compact',
};

/**
 * 宿主 MarkdownText 的薄壳：把源文本按行摊成段落，套上它真实的 `markdown` / `compact` 类，
 * 并认三种模型最常用的行内记号：`code`、**粗体**、以及 http(s) 链接。
 * @param {{ text: string, variant?: string }} props - 源文本与版本（body / compact）。
 * @returns {import('react').ReactNode} 渲染结果。
 */
export function MarkdownText({ text, variant = 'body' }) {
  const className = variant === 'compact' ? `${classOf.markdown} ${classOf.compact}` : classOf.markdown;
  const paragraphs = text.split(/\n{2,}/);
  return createElement(
    'div',
    { className, 'data-markdown-variant': variant === 'compact' ? 'compact' : undefined },
    paragraphs.map((paragraph, index) => createElement('p', { key: String(index) }, inline(paragraph))),
  );
}

/** 把一段文字按行内记号码成 React 节点。 */
function inline(text) {
  const nodes = [];
  const pattern = /`([^`]+)`|\*\*([^*]+)\*\*|(https?:\/\/[^\s，。）]+)/g;
  let last = 0;
  let match;
  let key = 0;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    if (match[1] !== undefined) nodes.push(createElement('code', { key: String(key++) }, match[1]));
    else if (match[2] !== undefined) nodes.push(createElement('strong', { key: String(key++) }, match[2]));
    else nodes.push(createElement('a', { key: String(key++), href: match[3] }, match[3]));
    last = pattern.lastIndex;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

/** 宿主的按钮薄壳：外观靠它真实的 `Button` 类。 */
export function Button(props) {
  return createElement(
    'button',
    { type: 'button', className: `button outline sm ${String(props.className ?? '')}`.trim(), onClick: props.onClick },
    props.icon ?? null,
    props.children,
  );
}

/** 宿主的标签薄壳：靠它真实的 `Tag` 类。 */
export function Tag(props) {
  return createElement('span', { className: `tag tag-${String(props.tone ?? 'outline')} ${String(props.className ?? '')}`.trim() }, props.children);
}

/** markdown 链接代理：真的那个只用 context 传 openFile，预览里不需要任何行为。 */
export function MarkdownDelegateProvider({ children }) {
  return children;
}

/** 图标薄壳：真的图标是路径很长的 SVG；预览里只需要占位与尺寸，颜色跟 currentColor 走。 */
function icon(name) {
  const Icon = ({ size = 16 }) => createElement(
    'svg',
    { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true', 'data-icon': name },
    createElement('circle', { cx: 8, cy: 8, r: 6, stroke: 'currentColor', strokeWidth: 1.2 }),
  );
  return Icon;
}

export const IconQuestionOutlineRegular = icon('question');
export const IconInspectOutlineRegular = icon('inspect');
export const IconDownloadOutlineRegular = icon('download');
export const IconBranchOutlineRegular = icon('branch');
export const IconCheckOutlineRegular = ({ size = 16 }) => createElement(
  'svg',
  { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true', 'data-icon': 'check' },
  createElement('path', { d: 'M3.5 8.5 6.5 11.5 12.5 4.5', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' }),
);

/** 界面文案。键集与英文逐一对齐，自检会查这一条。 */
export const NS = 'nativeplus';

/** 英文文案。 */
export const en = {
  'group.typography': 'Body text',
  'group.appearance': 'Appearance',

  'field.lineHeight': 'Line height',
  'hint.lineHeight': 'Line height for conversation body text.',
  'field.paragraphGap': 'Paragraph gap',
  'hint.paragraphGap': 'Space between two paragraphs in an answer, in pixels.',
  'field.shellEnabled': 'Sidebar, tabs and input card',
  'hint.shellEnabled': 'Round the sidebar rows and the active tab, drop the seam under the session header, and float the main column on the sidebar colour.',
  'field.embedFont': 'Bundled typeface',
  'hint.embedFont': 'Ship the typeface inside the plugin and use it for body text and code.',

  'state.unavailable': 'The Host does not serve this configuration right now.',
  'note.scope': 'Colors are the ones DSH already ships. This plugin only changes spacing, corners and the blue scale of headings.',
} as const;

/** 中文文案。 */
export const zh: Record<keyof typeof en, string> = {
  'group.typography': '正文排版',
  'group.appearance': '外观',

  'field.lineHeight': '行高',
  'hint.lineHeight': '对话正文的行高倍数。',
  'field.paragraphGap': '段落间距',
  'hint.paragraphGap': '一个回答里两段之间空多少像素。',
  'field.shellEnabled': '侧栏、标签条与输入卡',
  'hint.shellEnabled': '侧栏行与活动标签改成圆角，去掉会话头部下面那条接缝，中央列浮在侧栏底色上。',
  'field.embedFont': '内嵌字体',
  'hint.embedFont': '把字体打进插件，正文与代码都用它。',

  'state.unavailable': '宿主当前没有提供这份配置。',
  'note.scope': '颜色全部沿用 DSH 自带的那套。插件只改间距、圆角与标题的蓝色深浅。',
};

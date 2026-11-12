/** 界面文案。键集与英文逐一对齐，自检会查这一条。 */
export const NS = 'nativeplus';

/** 英文文案。 */
export const en = {
  'field.lineHeight': 'Line height',
  'hint.lineHeight': 'Line height for conversation body text.',
  'field.paragraphGap': 'Paragraph gap',
  'hint.paragraphGap': 'Space between two paragraphs in an answer, in pixels.',

  'state.unavailable': 'The Host does not serve this configuration right now.',
  'note.scope': 'Colors are the ones DSH already ships. This plugin only changes spacing and the blue scale of headings.',
} as const;

/** 中文文案。 */
export const zh: Record<keyof typeof en, string> = {
  'field.lineHeight': '行高',
  'hint.lineHeight': '对话正文的行高倍数。',
  'field.paragraphGap': '段落间距',
  'hint.paragraphGap': '一个回答里两段之间空多少像素。',

  'state.unavailable': '宿主当前没有提供这份配置。',
  'note.scope': '颜色全部沿用 DSH 自带的那套。插件只改间距与标题的蓝色深浅。',
};

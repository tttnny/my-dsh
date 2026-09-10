import React from 'react';
/**
 * 模型目录页（「可用模型」右侧 tab）：
 * - 「从 A6API 获取市场模型」：翻页拉取 A6API 市场全部模型 ID 入目录（参数初始为空）
 * - 「从 OpenRouter 一键查询」：对全部模型查 OpenRouter 并填充参数（name 仅用户手动填写）；
 *   每行也可单独查询
 * - 筛选：可用模型（当前令牌白名单，与「可用模型」页同源）/ 参数状态（已填/未填）
 * - 行内编辑 settings.yaml 原生模型字段；保存后若该模型已在 DSH 启用，
 *   服务端立即重写 settings.yaml 对应条目（参数即时生效）
 */
export declare const ModelCatalogPanel: React.FC;

/**
 * @lynn123411/dsh-agent-workflow browser half.
 * Visual user-turn, model-request, response, and tool-call explorer
 * (adapted to dsh 0.1.2-alpha.1; plain-JS source assembled by build.mjs).
 */
window.__ModuleLoader__.load({
  id: "@lynn123411/dsh-agent-workflow",
  factory: (require) => {
    'use strict';
    var module = { exports: {} };
    var exports = module.exports;


    if (typeof document !== 'undefined' && document.querySelector('style[data-plugin-css="dsh-agent-workflow/styles.css"]') === null) {
      var tag = document.createElement('style');
      tag.dataset.plugin = 'dsh-agent-workflow';
      tag.dataset.pluginCss = 'dsh-agent-workflow/styles.css';
      tag.textContent = "/* Agent Workflow view — plain CSS with dshaw- prefixed classes. */\n.dshaw-root {\n  display: flex;\n  flex-direction: column;\n  width: 100%;\n  height: 100%;\n  min-height: 0;\n  overflow: hidden;\n  color: var(--dsw-alias-label-primary);\n  background: var(--dsw-alias-bg-layer-1);\n}\n\n.dshaw-summary {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 24px;\n  min-height: 56px;\n  padding: 0 24px;\n  border-bottom: 1px solid var(--dsw-alias-border-l2);\n  box-sizing: border-box;\n}\n\n.dshaw-summaryTitle { display: flex; align-items: center; gap: 8px; font-size: 14px; }\n.dshaw-summaryTitle svg { color: var(--dsw-alias-state-business-primary); }\n.dshaw-metrics { display: flex; align-items: stretch; }\n.dshaw-metric {\n  display: flex;\n  flex-direction: column;\n  align-items: center;\n  min-width: 86px;\n  padding: 0 16px;\n  border-left: 1px solid var(--dsw-alias-border-l2);\n}\n.dshaw-metric strong { font-size: 14px; line-height: 18px; font-variant-numeric: tabular-nums; }\n.dshaw-metric span { color: var(--dsw-alias-label-tertiary); font-size: 10px; line-height: 14px; }\n\n.dshaw-workspace {\n  display: grid;\n  grid-template-columns: minmax(220px, 264px) minmax(0, 1fr);\n  flex: 1;\n  min-height: 0;\n  overflow: hidden;\n}\n\n.dshaw-turns {\n  display: flex;\n  flex-direction: column;\n  min-height: 0;\n  overflow: hidden;\n  --dsh-scrollbar-thumb: var(--dsw-alias-scrollbar-bg-l2);\n  --dsh-scrollbar-thumb-hover: var(--dsw-alias-scrollbar-hover-l2);\n  background: var(--dsw-alias-bg-layer-2);\n  border-right: 1px solid var(--dsw-alias-border-l2);\n}\n\n.dshaw-turns > header {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  min-height: 44px;\n  padding: 0 16px;\n  border-bottom: 1px solid var(--dsw-alias-border-l1);\n  font-size: 12px;\n}\n.dshaw-turns > header span { color: var(--dsw-alias-label-tertiary); font-variant-numeric: tabular-nums; }\n.dshaw-turnList { display: flex; flex: 1; flex-direction: column; gap: 8px; min-height: 0; padding: 10px; overflow-y: auto; overscroll-behavior: contain; scrollbar-gutter: stable; }\n\n.dshaw-turnItem {\n  position: relative;\n  display: flex;\n  flex-direction: column;\n  gap: 7px;\n  width: 100%;\n  padding: 12px;\n  color: var(--dsw-alias-label-primary);\n  background: var(--dsw-alias-bg-layer-1);\n  border: 1px solid var(--dsw-alias-border-l2);\n  border-radius: 9px;\n  font: inherit;\n  text-align: left;\n  cursor: pointer;\n  transition: border-color 160ms ease, background 160ms ease;\n}\n.dshaw-turnItem:hover { border-color: var(--dsw-alias-border-l4); background: var(--dsw-alias-interactive-bg-hover); }\n.dshaw-turnItem:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: 1px; }\n.dshaw-turnItemSelected { border-color: var(--dsw-alias-state-business-primary); background: var(--dsw-alias-state-business-tertiary); }\n.dshaw-turnTopline, .dshaw-turnBottomline { display: flex; align-items: center; justify-content: space-between; gap: 8px; }\n.dshaw-turnTopline strong { min-width: 0; overflow: hidden; font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }\n.dshaw-turnTopline time { color: var(--dsw-alias-label-tertiary); font-size: 10px; font-variant-numeric: tabular-nums; }\n.dshaw-turnBottomline > span:first-child { color: var(--dsw-alias-label-tertiary); font-size: 10px; }\n\n.dshaw-status { display: inline-flex; align-items: center; gap: 4px; color: var(--dsw-alias-label-tertiary); font-size: 10px; white-space: nowrap; }\n.dshaw-status_complete { color: var(--dsw-alias-state-success-primary); }\n.dshaw-status_error { color: var(--dsw-alias-state-error-primary); }\n.dshaw-status_running { color: var(--dsw-alias-state-business-primary); }\n.dshaw-status_running svg { animation: dshaw-spin 1s linear infinite; }\n\n.dshaw-loadOlder {\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  gap: 6px;\n  min-height: 36px;\n  margin: 0 10px 10px;\n  color: var(--dsw-alias-label-secondary);\n  background: transparent;\n  border: 1px solid var(--dsw-alias-border-l2);\n  border-radius: 7px;\n  font: inherit;\n  font-size: 11px;\n  cursor: pointer;\n}\n.dshaw-loadOlder:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }\n.dshaw-loadOlder:disabled { color: var(--dsw-alias-label-caption); cursor: wait; }\n\n.dshaw-main { display: flex; flex-direction: column; min-width: 0; min-height: 0; overflow: hidden; }\n.dshaw-turnHeader {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 18px;\n  min-height: 64px;\n  padding: 8px 20px;\n  background: var(--dsw-alias-bg-layer-1);\n  border-bottom: 1px solid var(--dsw-alias-border-l1);\n  box-sizing: border-box;\n}\n.dshaw-turnHeader > div:first-child { display: flex; min-width: 0; flex-direction: column; gap: 4px; }\n.dshaw-turnHeader > div:first-child span { color: var(--dsw-alias-state-business-primary); font-size: 11px; font-weight: 600; }\n.dshaw-turnHeader > div:first-child strong { overflow: hidden; font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }\n.dshaw-turnHeader > div:last-child { display: flex; align-items: center; gap: 12px; color: var(--dsw-alias-label-tertiary); font-size: 10px; white-space: nowrap; }\n.dshaw-turnHeader > div:last-child span { display: inline-flex; align-items: center; gap: 4px; }\n\n.dshaw-callScroller {\n  flex: 1;\n  min-height: 0;\n  overflow: auto;\n  overscroll-behavior: contain;\n  padding: 14px 16px 24px;\n  box-sizing: border-box;\n  scrollbar-gutter: stable;\n}\n.dshaw-virtualBody { position: relative; width: 100%; }\n.dshaw-virtualRow { position: absolute; top: 0; left: 0; width: 100%; padding-bottom: 12px; box-sizing: border-box; }\n.dshaw-callRow { overflow: hidden; background: var(--dsw-alias-bg-layer-1); border: 1px solid var(--dsw-alias-border-l2); border-radius: 10px; }\n.dshaw-callHeader {\n  display: flex;\n  align-items: center;\n  gap: 12px;\n  min-height: 38px;\n  padding: 0 14px;\n  color: var(--dsw-alias-label-tertiary);\n  background: var(--dsw-alias-bg-layer-2);\n  border-bottom: 1px solid var(--dsw-alias-border-l1);\n  font-size: 10px;\n}\n.dshaw-callHeader strong { margin-right: auto; color: var(--dsw-alias-label-primary); font-size: 12px; }\n.dshaw-callHeader > span { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }\n.dshaw-callHeader .dshaw-tokenMetric { gap: 6px; }\n.dshaw-tokenMetric small {\n  padding-left: 6px;\n  color: var(--dsw-alias-label-caption);\n  border-left: 1px solid var(--dsw-alias-border-l2);\n  font-size: inherit;\n}\n\n.dshaw-flow {\n  display: flex;\n  align-items: stretch;\n  width: 100%;\n  min-width: 0;\n  max-width: 100%;\n  padding: 14px;\n  overflow-x: auto;\n  overscroll-behavior-x: contain;\n  box-sizing: border-box;\n}\n.dshaw-flowCard {\n  --workflow-card-accent: var(--dsw-alias-border-l2);\n  --workflow-card-header-foreground: var(--dsw-alias-label-primary);\n  position: relative;\n  display: flex;\n  flex: 0 0 206px;\n  flex-direction: column;\n  min-width: 0;\n  padding: 0;\n  overflow: hidden;\n  color: var(--dsw-alias-label-primary);\n  background: var(--dsw-alias-bg-layer-1);\n  border: 1px solid var(--workflow-card-accent);\n  border-radius: 8px;\n  font: inherit;\n  text-align: left;\n  cursor: pointer;\n  transition: border-color 160ms ease, box-shadow 160ms ease, background 160ms ease;\n}\n.dshaw-flowCard:hover { background: var(--dsw-alias-interactive-bg-hover); border-color: var(--workflow-card-accent); }\n.dshaw-flowCard:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: 2px; }\n.dshaw-flowCardSelected::after {\n  position: absolute;\n  inset: 0;\n  border: 2px solid var(--workflow-card-accent);\n  border-radius: inherit;\n  content: '';\n  pointer-events: none;\n}\n.dshaw-requestCard {\n  --workflow-card-accent: #a6c9f9;\n  --workflow-card-header-background: #f1f6fe;\n  --workflow-card-header-foreground: #1557a6;\n}\n.dshaw-responseCard {\n  --workflow-card-accent: #b7aae0;\n  --workflow-card-header-background: #f8f5fd;\n  --workflow-card-header-foreground: #6747b0;\n}\n.dshaw-toolCard, .dshaw-toolCardError {\n  --workflow-card-accent: #f9cc9d;\n  --workflow-card-header-background: #fef7ef;\n  --workflow-card-header-foreground: #99500b;\n}\nbody[data-ds-dark-theme] .dshaw-requestCard { --workflow-card-header-background: #1d2a3d; --workflow-card-header-foreground: #9fc7ff; }\nbody[data-ds-dark-theme] .dshaw-responseCard { --workflow-card-header-background: #2a2435; --workflow-card-header-foreground: #c8b7f0; }\nbody[data-ds-dark-theme] .dshaw-toolCard,\nbody[data-ds-dark-theme] .dshaw-toolCardError { --workflow-card-header-background: #35291f; --workflow-card-header-foreground: #ffc98f; }\n.dshaw-cardHeader {\n  display: flex;\n  align-items: center;\n  min-height: 28px;\n  padding: 0 9px;\n  color: var(--workflow-card-header-foreground);\n  background: var(--workflow-card-header-background);\n}\n.dshaw-cardTitle { display: flex; align-items: center; gap: 6px; font-size: 10px; font-weight: 650; }\n.dshaw-cardBody { display: flex; flex-direction: column; gap: 8px; padding: 10px 11px 11px; }\n.dshaw-cardPreview { overflow: hidden; min-height: 16px; color: var(--dsw-alias-label-secondary); font-size: 10px; line-height: 16px; text-overflow: ellipsis; white-space: nowrap; }\n.dshaw-chips { display: flex; flex-wrap: wrap; gap: 5px; }\n.dshaw-chips span { padding: 2px 5px; color: var(--dsw-alias-label-secondary); background: var(--dsw-alias-bg-module-platform); border-radius: 4px; font-size: 9px; }\n.dshaw-arrow { align-self: center; flex: 0 0 auto; margin: 0 9px; color: var(--dsw-alias-label-caption); }\n.dshaw-toolFlow { display: flex; align-items: stretch; }\n.dshaw-toolResult { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 5px; padding: 3px 5px; color: var(--dsw-alias-label-secondary); border-radius: 5px; font-size: 9px; }\n.dshaw-toolResult span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }\n.dshaw-toolResult time { color: var(--dsw-alias-label-tertiary); font-variant-numeric: tabular-nums; }\n.dshaw-toolResultRunning svg { animation: dshaw-spin 1s linear infinite; transform-origin: center; }\n.dshaw-toolResultComplete { color: var(--dsw-alias-state-success-primary); background: var(--dsw-alias-state-success-tertiary); }\n.dshaw-toolResultComplete time { color: currentColor; }\n.dshaw-toolResultError { color: var(--dsw-alias-state-error-primary); background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 9%, transparent); }\n.dshaw-toolResultError time { color: currentColor; }\n.dshaw-finalReply { display: flex; align-items: center; color: var(--dsw-alias-label-secondary); font-size: 10px; }\n.dshaw-finalReply > span { display: flex; align-items: center; gap: 6px; padding: 10px; background: var(--dsw-alias-bg-layer-2); border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; }\n\n.dshaw-detailPanel { margin: 0 14px 14px; --dsh-scrollbar-thumb: var(--dsw-alias-scrollbar-bg-l2); --dsh-scrollbar-thumb-hover: var(--dsw-alias-scrollbar-hover-l2); background: var(--dsw-alias-bg-layer-2); border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; }\n.dshaw-detailPanel > header { display: flex; align-items: center; justify-content: space-between; min-height: 36px; padding: 0 10px 0 12px; border-bottom: 1px solid var(--dsw-alias-border-l1); font-size: 11px; }\n.dshaw-detailPanel > header button { display: grid; place-items: center; width: 26px; height: 26px; padding: 0; color: var(--dsw-alias-label-secondary); background: transparent; border: 0; border-radius: 5px; cursor: pointer; }\n.dshaw-detailPanel > header button:hover { background: var(--dsw-alias-interactive-bg-hover); }\n.dshaw-detailPanel > header button:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary); }\n.dshaw-detailGrid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1px; background: var(--dsw-alias-border-l1); }\n.dshaw-detailGrid section { display: flex; min-width: 0; flex-direction: column; padding: 10px 12px; background: var(--dsw-alias-bg-layer-1); }\n.dshaw-detailGrid h4 { margin: 0 0 7px; color: var(--dsw-alias-label-secondary); font-size: 10px; font-weight: 600; }\n.dshaw-detailGrid pre { max-height: 220px; margin: 0; overflow: auto; overscroll-behavior: contain; color: var(--dsw-alias-label-primary); font: 10px/16px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; white-space: pre-wrap; overflow-wrap: anywhere; }\n.dshaw-detailGrid section > [data-workflow-scroll-region] { flex: 1; min-height: 0; }\n.dshaw-detailGrid section > pre { max-height: 256px; }\n.dshaw-detailGrid .dshaw-detailCode { margin: 0; border-radius: 6px; }\n.dshaw-jsonInspector {\n  --workflow-json-property: #881391;\n  --workflow-json-string: #c41a16;\n  --workflow-json-number: #1c00cf;\n  --workflow-json-keyword: #1c00cf;\n  overflow: hidden;\n  background: var(--dsw-alias-bg-module-platform);\n  border: 1px solid var(--dsw-alias-border-l1);\n  border-radius: 7px;\n}\nbody[data-ds-dark-theme] .dshaw-jsonInspector,\nbody[data-ds-dark-theme] .dshaw-jsonDialogBody {\n  --workflow-json-property: #5db0d7;\n  --workflow-json-string: #f28b82;\n  --workflow-json-number: #99c8ff;\n  --workflow-json-keyword: #99c8ff;\n}\n.dshaw-jsonToolbar, .dshaw-jsonDialogHeader {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  min-height: 32px;\n  padding: 0 7px 0 10px;\n  border-bottom: 1px solid var(--dsw-alias-border-l1);\n}\n.dshaw-jsonLanguage, .dshaw-jsonDialogHeader strong {\n  display: inline-flex;\n  align-items: center;\n  gap: 6px;\n  color: var(--dsw-alias-label-secondary);\n  font-size: 10px;\n  font-weight: 600;\n  text-transform: uppercase;\n}\n.dshaw-jsonActions { display: flex; align-items: center; gap: 2px; }\n.dshaw-jsonAction {\n  display: grid;\n  width: 26px;\n  height: 26px;\n  padding: 0;\n  place-items: center;\n  color: var(--dsw-alias-label-secondary);\n  background: transparent;\n  border: 0;\n  border-radius: 5px;\n  cursor: pointer;\n  transition: color 160ms ease, background 160ms ease;\n}\n.dshaw-jsonAction:hover { color: var(--dsw-alias-label-primary); background: var(--dsw-alias-interactive-bg-hover); }\n.dshaw-jsonAction:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: 1px; }\n.dshaw-jsonViewport {\n  max-height: 220px;\n  padding: 10px 12px 12px;\n  overflow: auto;\n  overscroll-behavior: contain;\n  box-sizing: border-box;\n}\n.dshaw-jsonTree {\n  width: 100%;\n  min-width: 0;\n  color: var(--dsw-alias-label-primary);\n  font: 10px/17px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;\n  white-space: pre-wrap;\n  overflow-wrap: anywhere;\n}\n.dshaw-jsonDialog.dshaw-jsonDialog {\n  gap: 0;\n  width: min(1080px, calc(100vw - 48px));\n  height: min(760px, calc(100vh - 48px));\n  padding: 0;\n  border-radius: 14px;\n}\n.dshaw-jsonDialogHeader {\n  flex: 0 0 48px;\n  min-height: 48px;\n  padding: 0 12px 0 16px;\n  background: var(--dsw-alias-bg-layer-2);\n}\n.dshaw-jsonDialogHeader strong { color: var(--dsw-alias-label-primary); font-size: 13px; text-transform: none; }\n.dshaw-jsonDialogBody {\n  --workflow-json-property: #881391;\n  --workflow-json-string: #c41a16;\n  --workflow-json-number: #1c00cf;\n  --workflow-json-keyword: #1c00cf;\n  flex: 1;\n  min-height: 0;\n  padding: 18px 20px 28px;\n  overflow: auto;\n  overscroll-behavior: contain;\n  background: var(--dsw-alias-bg-layer-1);\n  box-sizing: border-box;\n}\n.dshaw-jsonDialogBody .dshaw-jsonTree { font-size: 12px; line-height: 20px; }\n.dshaw-empty { display: grid; min-height: 160px; place-items: center; color: var(--dsw-alias-label-tertiary); font-size: 12px; }\n\n@keyframes dshaw-spin { to { transform: rotate(360deg); } }\n\n@media (prefers-reduced-motion: reduce) {\n  .dshaw-turnItem, .dshaw-flowCard, .dshaw-jsonAction { transition: none; }\n  .dshaw-status_running svg, .dshaw-toolResultRunning svg { animation: none; }\n}\n\n@media (max-width: 900px) {\n  .dshaw-summary { align-items: flex-start; flex-direction: column; gap: 8px; padding: 10px 14px; }\n  .dshaw-metrics { width: 100%; }\n  .dshaw-metric { min-width: 0; flex: 1; padding: 0 8px; }\n  .dshaw-workspace { grid-template-columns: 1fr; grid-template-rows: minmax(138px, 28vh) minmax(0, 1fr); }\n  .dshaw-turns { border-right: 0; border-bottom: 1px solid var(--dsw-alias-border-l2); }\n  .dshaw-turnList { flex-direction: row; padding-bottom: 10px; overflow-x: auto; overflow-y: hidden; }\n  .dshaw-turnItem { flex: 0 0 210px; }\n  .dshaw-loadOlder { flex: 0 0 32px; margin: 0 10px 8px; }\n  .dshaw-turnHeader { align-items: flex-start; flex-direction: column; gap: 7px; }\n  .dshaw-turnHeader > div:last-child { flex-wrap: wrap; }\n  .dshaw-detailGrid { grid-template-columns: 1fr; }\n}\n\n@media (max-width: 560px) {\n  .dshaw-callHeader { gap: 8px; overflow-x: auto; flex-wrap: nowrap; }\n  .dshaw-callHeader > span:not(.dshaw-status) { display: inline-flex; font-size: 9px; }\n  .dshaw-flowCard { flex-basis: 178px; }\n  .dshaw-jsonDialog.dshaw-jsonDialog { width: calc(100vw - 20px); height: calc(100vh - 20px); border-radius: 10px; }\n  .dshaw-jsonDialogBody { padding: 14px 12px 20px; }\n}\n";
      document.head.appendChild(tag);
    }

    //#region src/client/imports.js
    /** Shell-provided module rows (seed table): React, the JSX runtime, and primitives. */
    const React = require('react');
    const { useState, useMemo, useRef, useEffect, useCallback } = React;
    const { jsx, jsxs, Fragment } = require('react/jsx-runtime');
    const {
      IconBranchOutline16,
      IconCheckOutline16,
      IconChevronDownOutline14,
      IconChevronRightOutline14,
      IconChevronUpOutline14,
      IconCloseOutline16,
      IconCodeOutline16,
      IconDataOutline16,
      IconFullscreenOutline16,
      IconLoadingOutline16,
      IconQueueOutline14,
      IconSendOutline16,
      IconSparkle16,
      IconWarningOutline16,
      JsonTree,
      CodeBlock,
      Modal,
    } = require('@deepseek-ai/dsh-client-ui-primitives');
    
    //#endregion
    //#region src/client/locales.js
    /** `workflow` namespace dictionaries for the visual Workflow view. */
    
    /** Dictionary namespace owned by this plugin. */
    const NS = 'workflow';
    
    /** Simplified Chinese dictionary (the key-set source of truth). */
    const zh = {
      'view.workflow': '工作流',
      'workflow.aria': 'Agent 工作流',
      'workflow.turn': '回合',
      'workflow.turnTitle': '第{turn}轮：{prompt}',
      'workflow.turns': '用户对话',
      'workflow.modelCall': '模型调用',
      'workflow.modelCalls': '模型调用',
      'workflow.tool': '工具调用',
      'workflow.tools.suffix': '次工具',
      'workflow.calls.suffix': '次模型调用',
      'workflow.request': 'REQUEST 请求',
      'workflow.request.context': '请求上下文',
      'workflow.response': 'RESPONSE 响应',
      'workflow.response.pending': '等待模型响应',
      'workflow.response.toolOnly': '仅包含工具调用',
      'workflow.finalReply': '最终回复',
      'workflow.system': 'System',
      'workflow.messages': '消息',
      'workflow.toolDefinitions': '工具定义',
      'workflow.toolCalls': '工具调用',
      'workflow.reasoning': 'Reasoning',
      'workflow.content': 'Content',
      'workflow.input': '输入',
      'workflow.inputUncached': '未缓存',
      'workflow.cacheRead': '缓存命中',
      'workflow.cacheWrite': '缓存写入',
      'workflow.output': '输出',
      'workflow.totalDuration': '总耗时',
      'workflow.status.waiting': '等待中',
      'workflow.status.running': '进行中',
      'workflow.status.complete': '已完成',
      'workflow.status.error': '失败',
      'workflow.tool.call': '执行工具',
      'workflow.tool.complete': '执行完成',
      'workflow.request.details': '请求详情',
      'workflow.response.details': '响应详情',
      'workflow.tool.details': '工具调用详情',
      'workflow.details.close': '收起详情',
      'workflow.copy': '复制',
      'workflow.copied': '已复制',
      'workflow.json.expand': '放大查看 JSON',
      'workflow.json.close': '关闭 JSON 查看器',
      'workflow.json.dialog': '{label} · JSON',
      'workflow.config': '模型配置',
      'workflow.systemPrompt': '系统提示词',
      'workflow.metadata': '响应指标',
      'workflow.arguments': '调用参数',
      'workflow.result': '执行结果',
      'workflow.schema': '工具定义',
      'workflow.empty': '无记录',
      'workflow.emptyTurns': '当前历史中没有用户对话',
      'workflow.emptyCalls': '这一回合还没有模型调用',
      'workflow.loadOlder': '加载更早回合',
      'workflow.loadingOlder': '正在加载',
    };
    
    /** English dictionary. */
    const en = {
      'view.workflow': 'Workflow',
      'workflow.aria': 'Agent workflow',
      'workflow.turn': 'Turn',
      'workflow.turnTitle': 'Conversation {turn}: {prompt}',
      'workflow.turns': 'User turns',
      'workflow.modelCall': 'Model call',
      'workflow.modelCalls': 'Model calls',
      'workflow.tool': 'Tool call',
      'workflow.tools.suffix': ' tools',
      'workflow.calls.suffix': ' model calls',
      'workflow.request': 'REQUEST',
      'workflow.request.context': 'Request context',
      'workflow.response': 'RESPONSE',
      'workflow.response.pending': 'Waiting for model response',
      'workflow.response.toolOnly': 'Tool calls only',
      'workflow.finalReply': 'Final reply',
      'workflow.system': 'System',
      'workflow.messages': 'Messages',
      'workflow.toolDefinitions': 'Tool definitions',
      'workflow.toolCalls': 'Tool calls',
      'workflow.reasoning': 'Reasoning',
      'workflow.content': 'Content',
      'workflow.input': 'Input',
      'workflow.inputUncached': 'Uncached',
      'workflow.cacheRead': 'Cache hit',
      'workflow.cacheWrite': 'Cache write',
      'workflow.output': 'Output',
      'workflow.totalDuration': 'Total duration',
      'workflow.status.waiting': 'Waiting',
      'workflow.status.running': 'Running',
      'workflow.status.complete': 'Complete',
      'workflow.status.error': 'Failed',
      'workflow.tool.call': 'Run tool',
      'workflow.tool.complete': 'Complete',
      'workflow.request.details': 'Request details',
      'workflow.response.details': 'Response details',
      'workflow.tool.details': 'Tool call details',
      'workflow.details.close': 'Collapse details',
      'workflow.copy': 'Copy',
      'workflow.copied': 'Copied',
      'workflow.json.expand': 'Open large JSON viewer',
      'workflow.json.close': 'Close JSON viewer',
      'workflow.json.dialog': '{label} · JSON',
      'workflow.config': 'Model configuration',
      'workflow.systemPrompt': 'System prompt',
      'workflow.metadata': 'Response metrics',
      'workflow.arguments': 'Arguments',
      'workflow.result': 'Result',
      'workflow.schema': 'Tool definition',
      'workflow.empty': 'No record',
      'workflow.emptyTurns': 'No user turns in the loaded history',
      'workflow.emptyCalls': 'This turn has no model calls yet',
      'workflow.loadOlder': 'Load earlier turns',
      'workflow.loadingOlder': 'Loading',
    };
    
    //#endregion
    //#region src/client/record.js
    /** Shared workflow record data and formatting contracts (plain-JS port). */
    
    /** Closed set of workflow record kinds. */
    const WorkflowCellKind = {
      SYSTEM: 'system',
      USER: 'user',
      CONTEXT: 'context',
      COMPACTED: 'compacted',
      MESSAGE: 'message',
      TOOL: 'tool',
      SUBTOOL: 'subtool',
    };
    
    /**
     * Resolve the identity that survives prepending older projected records.
     * @param cell - Projected workflow record.
     * @returns Stable identity from the owning event or tool call, with a fixture fallback.
     */
    function workflowRecordId(cell) {
      if (cell.recordId !== undefined) return cell.recordId;
      if (cell.callId !== undefined) return `${cell.kind}\u0000call\u0000${cell.callId}`;
      if (cell.sourceSeq !== undefined) return `${cell.kind}\u0000seq\u0000${cell.sourceSeq}`;
      return `${cell.kind}\u0000index\u0000${cell.index}`;
    }
    
    /**
     * Format a duration in milliseconds with thousands separators.
     * @param milliseconds - Duration in milliseconds, or null when absent.
     * @returns em dash when unknown, otherwise an integer-millisecond label.
     */
    function formatDurationMillis(milliseconds) {
      if (milliseconds === null || !Number.isFinite(milliseconds)) return '—';
      const integer = String(Math.round(milliseconds));
      return `${integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} ms`;
    }
    
    /**
     * Format an elapsed duration given in seconds as a millisecond label.
     * @param seconds - Duration seconds, or null when absent.
     * @returns em dash when unknown, otherwise an integer-millisecond label.
     */
    function formatElapsedSeconds(seconds) {
      return formatDurationMillis(seconds === null ? null : seconds * 1000);
    }
    
    //#endregion
    //#region src/client/layout.js
    /**
     * Workflow list fold: expand assistant blocks, attach usage to Message,
     * own-duration times, in-flight partial/runningCalls, and group descriptions.
     * Plain-JS port of the reference layout (rc.8) onto the 0.1.2 snapshot shape,
     * which is unchanged: nodes / eventLocations / partial / runningCalls /
     * requests / callSchemas.
     */
    
    /** One Message or Step group inside a turn. */
    /** @typedef {{ title: string, description?: string, cells: any[] }} WorkflowProjectionGroupModel */
    
    /** One sticky turn, or a standalone compaction section between turns. */
    /** @typedef {{ turn: number|null, groups: WorkflowProjectionGroupModel[] }} WorkflowProjectionTurnModel */
    
    function layoutEntryOrder(entry) {
      return entry.kind === 'system' && entry.change.kind === 'initial'
        ? Number.NEGATIVE_INFINITY
        : entry.seq;
    }
    
    function inputCellDetail(node) {
      const previewMarkdown = previewContent(node.content);
      return {
        text: '',
        ...(previewMarkdown === undefined ? {} : { previewMarkdown }),
        sourceSeq: node.seq,
        messageSource: node.source,
        inputDetail: detailContent(node.content),
        sourceBlocks: node.content.map(block => sourceBlock(block)),
        timeSeconds: 0,
        startedAt: finiteTime(node.time),
      };
    }
    
    /**
     * Fold a snapshot into turn -> Message/Step groups with expanded cells.
     * @param input - nodes plus in-flight partial/runningCalls.
     * @returns turns ordered by first appearance.
     */
    function deriveWorkflowLayout(input) {
      const {
        nodes, eventLocations, partial, runningCalls, requests = [], callSchemas,
      } = input;
      const resultByCall = indexResults(nodes);
      const callById = new Map(resultByCall);
      for (const call of runningCalls) callById.set(call.callId, call);
      const emittedCallIds = indexAssistantCallIds(nodes);
      const followingAssistants = indexFollowingAssistants(nodes);
      const callStartById = new Map();
      for (const result of resultByCall.values()) {
        const startedAt = finiteTime(result.callTime);
        if (startedAt !== null) callStartById.set(result.callId, startedAt);
      }
      for (const call of runningCalls) {
        const startedAt = finiteTime(call.time);
        if (startedAt !== null) callStartById.set(call.callId, startedAt);
      }
      const turns = new Map();
      const standaloneCompactions = [];
      let index = 0;
      let prevAbsTime = null;
      let lastAssistantTurn = null;
    
      const bucket = (turn) => {
        let entry = turns.get(turn);
        if (entry === undefined) {
          entry = { groups: [] };
          turns.set(turn, entry);
        }
        return entry;
      };
    
      const pushMessage = (turn, laid) => {
        const groups = bucket(turn).groups;
        const last = groups.at(-1);
        if (last !== undefined && last.title === 'Message') {
          last.laid.push(laid);
          return;
        }
        groups.push({ title: 'Message', laid: [laid] });
      };
      const pushStep = (turn, step, laid) => {
        if (laid.length === 0) return;
        const groups = bucket(turn).groups;
        const title = `Step ${step}`;
        const existing = groups.find(group => group.title === title);
        if (existing !== undefined) {
          existing.laid.push(...laid);
          return;
        }
        groups.push({ title, laid: [...laid] });
      };
      const pushStepInput = (turn, step, laid) => {
        if (laid.length === 0) return;
        const groups = bucket(turn).groups;
        const title = `Step ${step}`;
        const existing = groups.find(group => group.title === title);
        if (existing === undefined) {
          groups.push({ title, laid: [...laid] });
          return;
        }
        const request = existing.laid.findIndex(entry => entry.cell.requestOnly === true);
        if (request === -1) existing.laid.push(...laid);
        else existing.laid.splice(request, 0, ...laid);
      };
    
      const representedRequests = new Set();
      for (const node of nodes) {
        if (node.kind === 'assistant' && node.step > 0) {
          representedRequests.add(`${node.turn}\u0000${node.step}`);
        }
      }
      if (partial !== null && partial.step > 0) {
        representedRequests.add(`${partial.turn}\u0000${partial.step}`);
      }
      for (const call of runningCalls) {
        if (call.step > 0) representedRequests.add(`${call.turn}\u0000${call.step}`);
      }
    
      const entries = [
        ...nodes.map((node, nodeIndex) => ({
          kind: 'node', seq: node.seq, node, nodeIndex,
        })),
        ...requests
          .filter(request => request.purpose === 'compaction')
          .map(request => ({ kind: 'compaction', seq: request.startSeq, request })),
        ...requests.flatMap(request => request.purpose !== 'assistant'
          || request.promptChange === undefined
          || request.prompt === undefined
          ? []
          : [{
            kind: 'system',
            seq: request.promptChange.seq,
            request,
            change: request.promptChange,
          }]),
        ...requests
          .filter(request => request.purpose === 'assistant')
          .filter(request => !representedRequests.has(`${request.turn}\u0000${request.step}`))
          .map(request => ({ kind: 'request', seq: request.startSeq, request })),
      ].sort((left, right) => layoutEntryOrder(left) - layoutEntryOrder(right));
    
      for (const entry of entries) {
        if (entry.kind === 'request') {
          const { request } = entry;
          pushStep(request.turn, request.step, [{
            absTime: finiteTime(request.startedAt),
            cell: {
              index: ++index,
              kind: 'message',
              text: '',
              sourceSeq: request.startSeq,
              requestOnly: true,
              timeSeconds: request.completedAt === null
                ? null
                : durationSeconds(request.completedAt, request.startedAt),
              startedAt: finiteTime(request.startedAt),
              ...(request.status === 'error' ? { isError: true } : {}),
            },
          }]);
          prevAbsTime = finiteTime(request.completedAt)
            ?? finiteTime(request.startedAt)
            ?? prevAbsTime;
          continue;
        }
        if (entry.kind === 'system') {
          const { change, request } = entry;
          const turn = change.kind === 'initial'
            ? firstVisibleTurn(nodes, partial)
            : enclosingPromptTurn(nodes, change.seq, partial);
          pushMessage(turn, {
            absTime: finiteTime(change.time),
            cell: {
              index: ++index,
              kind: 'system',
              text: promptChangeLabel(change),
              sourceSeq: change.seq,
              ...(request.prompt === undefined ? {} : { promptDetail: request.prompt }),
              ...(change.previous === undefined
                ? {}
                : { previousPromptDetail: change.previous }),
              timeSeconds: 0,
              startedAt: finiteTime(change.time),
            },
          });
          prevAbsTime = finiteTime(change.time) ?? prevAbsTime;
          continue;
        }
        if (entry.kind === 'compaction') {
          const request = entry.request;
          const rawOutput = request.rawOutput ?? request.summary;
          const thinkingDetail = rawOutput === undefined
            ? ''
            : detailReasoning(rawOutput);
          const cell = {
            index: ++index,
            kind: 'compacted',
            text: request.status === 'running'
              ? 'Compacting context…'
              : request.status === 'error'
                ? request.error ?? 'Compaction failed'
                : request.summary === undefined
                  ? 'Context compacted'
                  : '',
            ...(request.status === 'complete' && request.summary !== undefined
              ? previewContentProperty(request.summary)
              : {}),
            sourceSeq: request.startSeq,
            ...(request.summary === undefined
              ? {}
              : {
                outputDetail: detailContent(request.summary),
                outputBlocks: request.summary.map(block => sourceBlock(block)),
              }),
            ...(thinkingDetail === '' ? {} : { thinkingDetail }),
            ...(rawOutput === undefined
              ? {}
              : { sourceBlocks: rawOutput.map(block => sourceBlock(block)) }),
            ...(request.status === 'error' ? { isError: true } : {}),
            timeSeconds: request.completedAt === null
              ? null
              : durationSeconds(request.completedAt, request.startedAt),
            startedAt: finiteTime(request.startedAt),
          };
          attachUsage(cell, request.usage);
          const compaction = {
            groups: [{
              title: `Compaction ${request.startSeq}`,
              laid: [{
                absTime: finiteTime(request.startedAt),
                cell,
              }],
            }],
          };
          if (request.turn === null) standaloneCompactions.push(compaction);
          else bucket(request.turn).groups.push(...compaction.groups);
          prevAbsTime = finiteTime(request.completedAt) ?? finiteTime(request.startedAt) ?? prevAbsTime;
          continue;
        }
        const { node, nodeIndex: i } = entry;
        if (node.kind === 'user') {
          const turn = enclosingUserTurn(followingAssistants[i], partial, lastAssistantTurn);
          pushMessage(turn, {
            absTime: finiteTime(node.time),
            cell: {
              index: ++index,
              kind: 'user',
              ...inputCellDetail(node),
              opensTurn: true,
            },
          });
          prevAbsTime = finiteTime(node.time) ?? prevAbsTime;
          continue;
        }
        if (node.kind === 'steering') {
          const placement = steeringPlacement(
            followingAssistants[i],
            partial,
            lastAssistantTurn,
            eventLocations !== undefined ? eventLocations.get(node.seq) : undefined,
          );
          const laid = {
            absTime: finiteTime(node.time),
            cell: {
              index: ++index,
              kind: 'user',
              ...inputCellDetail(node),
            },
          };
          if (placement.step === undefined) pushMessage(placement.turn, laid);
          else pushStepInput(placement.turn, placement.step, [laid]);
          prevAbsTime = finiteTime(node.time) ?? prevAbsTime;
          continue;
        }
        if (node.kind === 'assistant') {
          const laidList = withSubCalls(
            expandAssistant(node, index + 1, prevAbsTime, resultByCall, callStartById, callById),
          );
          if (node.step > 0) pushStep(node.turn, node.step, laidList);
          else for (const laid of laidList) pushMessage(node.turn, laid);
          const last = laidList[laidList.length - 1];
          if (last !== undefined) index = last.cell.index;
          prevAbsTime = finiteTime(node.time) ?? prevAbsTime;
          lastAssistantTurn = node.turn;
          continue;
        }
        if (node.kind === 'context') {
          const turn = enclosingUserTurn(followingAssistants[i], partial, lastAssistantTurn);
          pushMessage(turn, {
            absTime: finiteTime(node.time),
            cell: {
              index: ++index,
              kind: 'context',
              ...inputCellDetail(node),
            },
          });
          prevAbsTime = finiteTime(node.time) ?? prevAbsTime;
          continue;
        }
        if (node.kind === 'compaction') {
          prevAbsTime = finiteTime(node.time) ?? prevAbsTime;
          continue;
        }
        if (node.kind === 'tool-result') {
          if (!emittedCallIds.has(node.callId)) {
            const toolName = node.call !== null ? node.call.name : undefined;
            const resultPreview = summarizeResult(node);
            const laidList = [{
              absTime: finiteTime(node.callTime ?? node.time),
              ...(toolName !== undefined ? { toolName } : {}),
              callId: node.callId,
              subCalls: node.subCalls,
              cell: {
                index: ++index,
                kind: 'tool',
                sourceSeq: node.seq,
                ...(node.call !== null
                  ? summarizeCall(node.call.name, node.call.argsRaw)
                  : resultAsText(resultPreview)),
                ...(node.call !== null ? { inputDetail: node.call.argsRaw } : {}),
                outputDetail: detailResult(node),
                outputBlocks: node.content.map(block => sourceBlock(block)),
                ...resultPreview,
                callId: node.callId,
                isError: node.isError,
                timeSeconds: durationSeconds(node.time, node.callTime),
                startedAt: finiteTime(node.callTime),
              },
            }];
            for (const laid of expandSubCalls(node.subCalls, index)) {
              laidList.push(laid);
              index = laid.cell.index;
            }
            pushStep(0, 1, laidList);
          }
          prevAbsTime = finiteTime(node.time) ?? prevAbsTime;
        }
      }
    
      if (partial !== null) {
        const fake = {
          kind: 'assistant', seq: Number.MAX_SAFE_INTEGER, time: 0,
          turn: partial.turn, step: partial.step, blocks: partial.blocks,
        };
        const laidList = withSubCalls(expandAssistant(
          fake,
          index + 1,
          prevAbsTime,
          resultByCall,
          callStartById,
          callById,
          { streaming: true },
        ));
        if (partial.step > 0) pushStep(partial.turn, partial.step, laidList);
        else for (const laid of laidList) pushMessage(partial.turn, laid);
        const last = laidList[laidList.length - 1];
        if (last !== undefined) index = last.cell.index;
      }
    
      const seenCalls = collectCallIds(turns);
      for (const call of runningCalls) {
        if (seenCalls.has(call.callId)) continue;
        const laidList = [{
          absTime: null,
          toolName: call.name,
          callId: call.callId,
          subCalls: call.subCalls,
          cell: {
            index: ++index,
            kind: 'tool',
            ...summarizeCall(call.name, call.argsRaw),
            inputDetail: call.argsRaw,
            callId: call.callId,
            timeSeconds: null,
            startedAt: finiteTime(call.time),
          },
        }];
        for (const laid of expandSubCalls(call.subCalls, index)) {
          laidList.push(laid);
          index = laid.cell.index;
        }
        if (call.step > 0) pushStep(call.turn, call.step, laidList);
        else for (const laid of laidList) pushMessage(call.turn, laid);
      }
    
      // Orphan turn-0 cells (orphaned tools) fold into Turn 1.
      const prologue = turns.get(0);
      if (prologue !== undefined) {
        turns.delete(0);
        const emptyTurn = () => ({ groups: [] });
        const first = turns.get(1) ?? emptyTurn();
        first.groups = [...prologue.groups, ...first.groups];
        turns.set(1, first);
      }
    
      for (const entry of [...turns.values(), ...standaloneCompactions]) {
        for (const group of entry.groups) {
          for (const laid of group.laid) attachToolSchema(laid, callSchemas);
        }
      }
    
      return [
        ...[...turns.entries()].map(([turn, entry]) => toTurnModel(turn, entry)),
        ...standaloneCompactions.map(entry => toTurnModel(null, entry)),
      ].sort((left, right) => firstCellIndex(left) - firstCellIndex(right));
    }
    
    function attachToolSchema(laid, callSchemas) {
      if (laid.callId === undefined || callSchemas === undefined) return;
      const schema = callSchemas.get(laid.callId);
      if (schema === undefined) return;
      laid.cell.schemaDetail = JSON.stringify(schema, null, 2);
    }
    
    function toTurnModel(turn, entry) {
      const groups = entry.groups.map(({ title, laid }) => {
        const description = groupDescription(laid);
        return {
          title,
          ...(description !== undefined ? { description } : {}),
          cells: laid.map(l => l.cell),
        };
      });
      return { turn, groups };
    }
    
    /** Chronological section position from the fold's monotonically assigned cell indexes. */
    function firstCellIndex(turn) {
      return Math.min(
        ...turn.groups.flatMap(group => group.cells.map(cell => cell.index)),
        Number.POSITIVE_INFINITY,
      );
    }
    
    /** Wall-span duration + tool histogram, e.g. `1.5 s bash×6`. */
    function groupDescription(laid) {
      const parts = [];
      const times = [];
      for (const l of laid) {
        if (l.absTime === null || !Number.isFinite(l.absTime)) continue;
        times.push(l.absTime);
        if (l.cell.kind === 'tool' && l.cell.timeSeconds !== null && Number.isFinite(l.cell.timeSeconds)) {
          times.push(l.absTime + l.cell.timeSeconds * 1000);
        }
      }
      if (times.length >= 2) {
        const span = formatGroupDuration((Math.max(...times) - Math.min(...times)) / 1000);
        if (span !== undefined) parts.push(span);
      } else if (times.length === 1) {
        const own = laid.find(l => l.absTime === times[0])?.cell.timeSeconds;
        const span = own !== null && own !== undefined ? formatGroupDuration(own) : undefined;
        if (span !== undefined) parts.push(span);
      }
      const tools = new Map();
      for (const l of laid) {
        if (l.toolName === undefined || l.cell.kind !== 'tool') continue;
        tools.set(l.toolName, (tools.get(l.toolName) ?? 0) + 1);
      }
      for (const [name, count] of tools) {
        parts.push(count > 1 ? `${name}×${count}` : name);
      }
      return parts.length === 0 ? undefined : parts.join(' ');
    }
    
    function formatGroupDuration(seconds) {
      if (!Number.isFinite(seconds)) return undefined;
      return formatElapsedSeconds(seconds);
    }
    
    /** Own-duration seconds from two epoch-ms stamps; null when either is unusable. */
    function durationSeconds(later, earlier) {
      if (earlier === null || !Number.isFinite(later) || !Number.isFinite(earlier)) return null;
      return Math.max(0, (later - earlier) / 1000);
    }
    
    /** Epoch-ms usable as an absolute time, else null. */
    function finiteTime(time) {
      return typeof time === 'number' && Number.isFinite(time) ? time : null;
    }
    
    function expandAssistant(node, startIndex, prevAbsTime, results, callStarts, calls, opts) {
      if (opts !== undefined && opts.streaming === true && node.blocks.length === 0) return [];
      const out = [];
      let index = startIndex - 1;
      const usage = node.usage;
      const streaming = opts !== undefined && opts.streaming === true;
      const recordedStart = finiteTime(node.timing !== undefined ? node.timing.stepStartTime : null);
      const messageDuration = streaming
        ? null
        : durationSeconds(node.time, recordedStart ?? prevAbsTime);
      const nodeAbs = streaming ? null : finiteTime(node.time);
      const messageText = node.blocks
        .filter(block => block.kind === 'text' && (!streaming || block.text !== ''))
        .map(block => block.kind === 'text' ? block.text : '')
        .join('\n\n');
      const thinkingText = node.blocks
        .filter(block => block.kind === 'reasoning' && (!streaming || block.text !== ''))
        .map(block => block.kind === 'reasoning' ? block.text : '')
        .join('\n\n');
      const message = {
        index: ++index,
        recordId: `assistant\u0000${node.turn}\u0000${node.step}`,
        kind: 'message',
        sourceSeq: node.seq,
        text: messageText !== '' || thinkingText !== ''
          ? ''
          : summarizeAssistantActivity(node.blocks),
        ...(messageText !== ''
          ? { previewMarkdown: messageText }
          : thinkingText !== ''
            ? { previewMarkdown: thinkingText }
            : {}),
        ...(messageText !== '' ? { outputDetail: messageText } : {}),
        ...(thinkingText !== '' ? { thinkingDetail: thinkingText } : {}),
        sourceBlocks: node.blocks.map(block => assistantSourceBlock(block)),
        timeSeconds: messageDuration,
        startedAt: recordedStart,
      };
      attachUsage(message, usage);
      message.assistantMetrics = {
        timingRecorded: node.timing !== undefined,
        stepStartTime: node.timing !== undefined ? node.timing.stepStartTime ?? null : null,
        firstTokenTime: node.timing !== undefined ? node.timing.firstTokenTime ?? null : null,
        completedTime: streaming ? null : finiteTime(node.time),
        usageProvided: usage !== undefined,
        outputTokens: Number.isFinite(usage !== undefined ? usage.outputTokens : undefined)
          ? usage.outputTokens
          : null,
      };
      out.push({ absTime: nodeAbs, cell: message });
    
      for (const block of node.blocks) {
        if (block.kind !== 'tool-call') continue;
        const result = results.get(block.callId);
        const toolDuration = streaming || result === undefined
          ? null
          : durationSeconds(result.time, result.callTime);
        const callAbs = finiteTime(callStarts.get(block.callId));
        const call = calls.get(block.callId);
        const resultPreview = result === undefined ? undefined : summarizeResult(result);
        out.push({
          absTime: callAbs,
          toolName: block.name,
          callId: block.callId,
          ...(call === undefined ? {} : { subCalls: call.subCalls }),
          cell: {
            index: ++index, kind: 'tool',
            ...summarizeCall(block.name, block.argsRaw),
            inputDetail: block.argsRaw,
            callId: block.callId,
            ...(result !== undefined
              ? {
                outputDetail: detailResult(result),
                outputBlocks: result.content.map(block => sourceBlock(block)),
                ...resultPreview,
                isError: result.isError,
              }
              : {}),
            timeSeconds: toolDuration,
            startedAt: callAbs,
          },
        });
      }
      return out;
    }
    
    function summarizeAssistantActivity(blocks) {
      const tools = new Map();
      for (const block of blocks) {
        if (block.kind !== 'tool-call') continue;
        tools.set(block.name, (tools.get(block.name) ?? 0) + 1);
      }
      return tools.size > 0 ? 'Tool call only' : '';
    }
    
    function promptChangeLabel(change) {
      if (change.kind === 'initial') return 'Initial System Prompt';
      if (change.kind === 'system') return 'System Prompt Updated';
      if (change.kind === 'tools') return 'Tools Updated';
      return 'System Prompt and Tools Updated';
    }
    
    function assistantSourceBlock(block) {
      switch (block.kind) {
        case 'text': return { type: 'text', content: block.text };
        case 'reasoning': return { type: 'thinking', content: block.text };
        case 'tool-call': return {
          type: 'tool-call',
          content: block.argsRaw,
          callId: block.callId,
          toolName: block.name,
        };
        case 'image': return {
          type: 'image',
          content: stringifySourceValue(block.attachment),
        };
        default: return sourceBlock(block.block);
      }
    }
    
    function sourceBlock(value) {
      if (typeof value !== 'object' || value === null) {
        return { type: 'unknown', content: stringifySourceValue(value) };
      }
      const block = value;
      const type = typeof block.type === 'string' ? block.type : 'unknown';
      if (typeof block.text === 'string') {
        return { type: type === 'reasoning' ? 'thinking' : type, content: block.text };
      }
      const imageSrc = sourceImage(block);
      const imageAlt = typeof block.alt === 'string' ? block.alt : undefined;
      return {
        type,
        content: imageSrc === undefined ? stringifySourceValue(value) : '',
        ...(imageSrc !== undefined ? { imageSrc } : {}),
        ...(imageAlt !== undefined ? { imageAlt } : {}),
      };
    }
    
    function sourceImage(block) {
      if (typeof block.type !== 'string' || !block.type.toLowerCase().includes('image')) return undefined;
      for (const candidate of [block.url, block.image_url]) {
        if (typeof candidate === 'string') return safeImageSource(candidate);
      }
      if (typeof block.data === 'string') {
        const mediaType = [block.mimeType, block.mediaType, block.media_type]
          .find(candidate => typeof candidate === 'string')
          ?? 'image/png';
        return safeImageSource(
          block.data.startsWith('data:')
            ? block.data
            : `data:${mediaType};base64,${block.data}`,
        );
      }
      if (typeof block.source !== 'object' || block.source === null) return undefined;
      const source = block.source;
      if (typeof source.url === 'string') return safeImageSource(source.url);
      if (typeof source.data !== 'string') return undefined;
      const mediaType = typeof source.media_type === 'string' ? source.media_type : 'image/png';
      return safeImageSource(`data:${mediaType};base64,${source.data}`);
    }
    
    function safeImageSource(value) {
      if (value.startsWith('data:image/') || value.startsWith('blob:')) return value;
      try {
        const protocol = new URL(value).protocol;
        return protocol === 'http:' || protocol === 'https:' ? value : undefined;
      } catch {
        return undefined;
      }
    }
    
    function stringifySourceValue(value) {
      const json = JSON.stringify(value, null, 2);
      return json || String(value);
    }
    
    /** Turn that encloses a user/message: next assistant turn, else the in-flight partial, else the turn after the last finalized assistant (or 1). */
    function enclosingUserTurn(followingAssistant, partial, lastAssistantTurn) {
      if (followingAssistant !== undefined) return followingAssistant.turn;
      if (partial !== null) return partial.turn;
      if (lastAssistantTurn !== null) return lastAssistantTurn + 1;
      return 1;
    }
    
    function steeringPlacement(followingAssistant, partial, lastAssistantTurn, location) {
      if (location !== undefined && location.kind === 'step') {
        return { turn: location.turn.turn, step: location.step.step };
      }
      const locatedTurn = location !== undefined && location.kind === 'turn'
        ? location.turn.turn
        : undefined;
      if (followingAssistant !== undefined
        && (locatedTurn === undefined || followingAssistant.turn === locatedTurn)) {
        return {
          turn: followingAssistant.turn,
          ...(followingAssistant.step > 0 ? { step: followingAssistant.step } : {}),
        };
      }
      if (partial !== null && (locatedTurn === undefined || partial.turn === locatedTurn)) {
        return { turn: partial.turn, ...(partial.step > 0 ? { step: partial.step } : {}) };
      }
      if (locatedTurn !== undefined) return { turn: locatedTurn };
      return { turn: lastAssistantTurn ?? 1 };
    }
    
    function indexFollowingAssistants(nodes) {
      const following = new Array(nodes.length);
      let assistant;
      for (let index = nodes.length - 1; index >= 0; index--) {
        following[index] = assistant;
        const node = nodes[index];
        if (node !== undefined && node.kind === 'assistant') assistant = node;
      }
      return following;
    }
    
    function enclosingPromptTurn(nodes, seq, partial) {
      const next = nodes.find(node =>
        node.seq > seq && node.kind === 'assistant' && node.step > 0);
      if (next !== undefined && next.kind === 'assistant') return next.turn;
      return partial !== null ? partial.turn : 1;
    }
    
    /** Earliest raw turn represented by the selected workflow branch. */
    function firstVisibleTurn(nodes, partial) {
      const turns = nodes.flatMap(node =>
        node.kind === 'assistant' && node.turn > 0 ? [node.turn] : []);
      if (partial !== null && partial.turn > 0) turns.push(partial.turn);
      return turns.length === 0 ? 1 : Math.min(...turns);
    }
    
    /** Copy provider usage onto a Message cell when present. */
    function attachUsage(cell, usage) {
      if (usage === undefined) return;
      if (usage.inputTokens !== undefined) cell.input = usage.inputTokens;
      if (usage.cacheReadTokens !== undefined) cell.cacheRead = usage.cacheReadTokens;
      if (usage.cacheWriteTokens !== undefined) cell.cacheWrite = usage.cacheWriteTokens;
      if (usage.outputTokens !== undefined) cell.output = usage.outputTokens;
      if (usage.reasoningTokens !== undefined) cell.think = usage.reasoningTokens;
    }
    
    function indexResults(nodes) {
      const map = new Map();
      for (const node of nodes) {
        if (node.kind === 'tool-result') map.set(node.callId, node);
      }
      return map;
    }
    
    function indexAssistantCallIds(nodes) {
      const ids = new Set();
      for (const node of nodes) {
        if (node.kind !== 'assistant') continue;
        for (const block of node.blocks) {
          if (block.kind === 'tool-call') ids.add(block.callId);
        }
      }
      return ids;
    }
    
    function collectCallIds(turns) {
      const ids = new Set();
      for (const entry of turns.values()) {
        for (const group of entry.groups) {
          for (const laid of group.laid) {
            if (laid.callId !== undefined) ids.add(laid.callId);
          }
        }
      }
      return ids;
    }
    
    /** Interleave each tool cell's nested child calls right after it, reindexing followers. */
    function withSubCalls(laidList) {
      if (!laidList.some(laid => laid.subCalls !== undefined && laid.subCalls.length > 0)) return laidList;
      const out = [];
      let index = laidList[0] !== undefined ? laidList[0].cell.index - 1 : 0;
      for (const laid of laidList) {
        out.push({ ...laid, cell: { ...laid.cell, index: ++index } });
        for (const sub of expandSubCalls(laid.subCalls, index)) {
          out.push(sub);
          index = sub.cell.index;
        }
      }
      return out;
    }
    
    /** Sub-dispatch cells for one run_code parent, in start order (running = null duration). */
    function expandSubCalls(subs, startIndex) {
      if (subs === undefined || subs.length === 0) return [];
      const out = [];
      let index = startIndex;
      for (const sub of subs) {
        const settled = 'kind' in sub;
        const resultPreview = settled ? summarizeResult(sub) : undefined;
        const laid = {
          absTime: settled ? finiteTime(sub.callTime ?? sub.time) : finiteTime(sub.time),
          toolName: settled ? (sub.call !== null ? sub.call.name : sub.callId) : sub.name,
          callId: sub.callId,
          cell: {
            index: ++index,
            kind: 'subtool',
            callId: sub.callId,
            ...(settled
              ? (sub.call !== null
                ? summarizeCall(sub.call.name, sub.call.argsRaw)
                : resultAsText(resultPreview))
              : summarizeCall(sub.name, sub.argsRaw)),
            ...(settled
              ? (sub.call !== null ? { inputDetail: sub.call.argsRaw } : {})
              : { inputDetail: sub.argsRaw }),
            ...(settled
              ? {
                outputDetail: detailResult(sub),
                outputBlocks: sub.content.map(block => sourceBlock(block)),
                ...resultPreview,
                isError: sub.isError,
              }
              : {}),
            timeSeconds: settled ? durationSeconds(sub.time, sub.callTime) : null,
            startedAt: settled
              ? finiteTime(sub.callTime)
              : finiteTime(sub.time),
          },
        };
        out.push(laid);
        for (const child of expandSubCalls(sub.subCalls, index)) {
          out.push(child);
          index = child.cell.index;
        }
      }
      return out;
    }
    
    function summarizeCall(name, argsRaw) {
      return {
        text: name,
        ...(argsRaw === '' ? {} : { previewMarkdown: argsRaw }),
      };
    }
    
    function summarizeResult(node) {
      if (node.isError) {
        return { result: node.error !== undefined ? node.error.code ?? 'error' : 'error' };
      }
      for (const block of node.content) {
        if (block.type === 'text' && typeof block.text === 'string' && block.text !== '') {
          return { result: '', resultPreviewMarkdown: block.text };
        }
      }
      return { result: 'No output' };
    }
    
    function resultAsText(result) {
      return {
        text: result !== undefined ? result.result ?? '' : '',
        ...(result !== undefined && result.resultPreviewMarkdown !== undefined
          ? { previewMarkdown: result.resultPreviewMarkdown }
          : {}),
      };
    }
    
    function detailResult(node) {
      if (node.isError) {
        return node.error === undefined
          ? 'error'
          : `${node.error.name}: ${node.error.code}`;
      }
      const text = node.content
        .filter(block => block.type === 'text' && typeof block.text === 'string')
        .map(block => block.type === 'text' ? block.text : '')
        .join('\n');
      if (text !== '') return text;
      if (
        node.content.length === 0
        || node.content.every(block =>
          block.type === 'text' && (typeof block.text !== 'string' || block.text === ''))
      ) return 'No output';
      return JSON.stringify(node.content, null, 2);
    }
    
    function detailContent(content) {
      return content
        .filter(block => block.type === 'text' && typeof block.text === 'string')
        .map(block => block.text ?? '')
        .join('\n');
    }
    
    function detailReasoning(content) {
      return content
        .filter(block => block.type === 'reasoning' && typeof block.text === 'string')
        .map(block => block.text ?? '')
        .join('\n');
    }
    
    function previewContent(content) {
      for (const block of content) {
        if (block.type === 'text' && typeof block.text === 'string') return block.text;
      }
      return undefined;
    }
    
    function previewContentProperty(content) {
      const previewMarkdown = previewContent(content);
      return previewMarkdown === undefined ? {} : { previewMarkdown };
    }
    
    //#endregion
    //#region src/client/model.js
    /** Turn and model-call projection for the visual Workflow view (plain-JS port). */
    
    /** Lifecycle shown by a workflow turn or model call. */
    const WorkflowStatus = {
      WAITING: 'waiting',
      RUNNING: 'running',
      COMPLETE: 'complete',
      ERROR: 'error',
    };
    
    const STEP_TITLE_PREFIX = 'Step ';
    function stepNumber(title) {
      if (!title.startsWith(STEP_TITLE_PREFIX)) return null;
      const rest = title.slice(STEP_TITLE_PREFIX.length).trim();
      const match = /^(\d+)(?:\b|$)/.exec(rest);
      return match === null ? null : Number(match[1]);
    }
    
    function preview(cell) {
      if (cell === undefined) return '';
      return (cell.previewMarkdown ?? cell.text).replace(/\s+/g, ' ').trim();
    }
    
    function truncatePrompt(value) {
      const characters = Array.from(value);
      return characters.length > 20 ? `${characters.slice(0, 20).join('')}…` : value;
    }
    
    function callUsage(response) {
      if (response === undefined) return undefined;
      const hasInput = response.input !== undefined
        || response.cacheRead !== undefined
        || response.cacheWrite !== undefined;
      if (!hasInput && response.output === undefined) return undefined;
      return {
        inputTotal: hasInput
          ? (response.input ?? 0) + (response.cacheRead ?? 0) + (response.cacheWrite ?? 0)
          : undefined,
        inputUncached: response.input,
        cacheRead: response.cacheRead,
        cacheWrite: response.cacheWrite,
        output: response.output,
      };
    }
    
    function callStatus(request, response, tools) {
      if (request !== undefined && request.status === 'error'
        || response !== undefined && response.isError === true
        || tools.some(tool => tool.isError === true)) {
        return 'error';
      }
      if (request !== undefined && request.status === 'running'
        || tools.some(tool => tool.timeSeconds === null
          && tool.outputDetail === undefined
          && tool.result === undefined
          && tool.resultPreviewMarkdown === undefined)) {
        return 'running';
      }
      if (request !== undefined && request.status === 'complete'
        || response !== undefined
        || tools.length > 0) return 'complete';
      return 'waiting';
    }
    
    function callDuration(request, cells) {
      if (request !== undefined && request.completedAt !== null) {
        return Math.max(0, request.completedAt - request.startedAt);
      }
      const durations = cells
        .map(cell => cell.timeSeconds)
        .filter(value => value !== null && Number.isFinite(value));
      return durations.length === 0 ? null : Math.max(...durations) * 1000;
    }
    
    function turnStatus(calls) {
      if (calls.some(call => call.status === 'running')) return 'running';
      if (calls.some(call => call.status === 'error')) return 'error';
      const last = calls.at(-1);
      return last !== undefined ? last.status : 'waiting';
    }
    
    function turnDuration(turn, calls, timings) {
      const timing = timings.get(turn);
      if (timing !== undefined && timing.endTime !== undefined) {
        return Math.max(0, timing.endTime - timing.startTime);
      }
      const starts = calls
        .map(call => call.startedAt)
        .filter(value => value !== null);
      const ends = calls.flatMap(call => call.startedAt === null || call.durationMs === null
        ? []
        : [call.startedAt + call.durationMs]);
      if (starts.length === 0 || ends.length === 0) return null;
      return Math.max(0, Math.max(...ends) - Math.min(...starts));
    }
    
    /**
     * Fold the Trajectory layout into a user-turn index and model-call rows.
     * @param turns - Existing replay-safe Trajectory turn layout.
     * @param requests - Provider request lifecycles from the same projection.
     * @param timings - Session-owned turn timing boundaries (empty when absent).
     * @returns Visual workflow model ordered by user turn and step.
     */
    function deriveWorkflowModel(turns, requests, timings = new Map()) {
      const assistantRequests = requests.filter(request => request.purpose === 'assistant');
      const requestsByStep = new Map(
        assistantRequests.map(request => [`${request.turn}:${request.step}`, request]),
      );
      const workflowTurns = turns.flatMap((entry) => {
        if (entry.turn === null) return [];
        const turn = entry.turn;
        const prologue = entry.groups
          .filter(group => group.title === 'Message')
          .flatMap(group => group.cells);
        const opening = prologue.find(cell => cell.kind === 'user' && cell.opensTurn === true)
          ?? prologue.find(cell => cell.kind === 'user');
        const callGroups = entry.groups.flatMap(group => stepNumber(group.title) === null ? [] : [group]);
        const calls = callGroups.flatMap((group, index) => {
          const step = stepNumber(group.title);
          if (step === null) return [];
          const request = requestsByStep.get(`${turn}:${step}`);
          const response = group.cells.find(cell => cell.kind === 'message' && cell.requestOnly !== true);
          const tools = group.cells.filter(cell => cell.kind === 'tool' || cell.kind === 'subtool');
          const inputs = [
            ...(step === 1 ? prologue.filter(cell => cell.kind === 'user' || cell.kind === 'context') : []),
            ...group.cells.filter(cell => cell.kind === 'user' || cell.kind === 'context' || cell.kind === 'system'),
          ];
          if (request === undefined && response === undefined && tools.length === 0) return [];
          const cells = [...inputs, ...(response === undefined ? [] : [response]), ...tools];
          return [{
            id: `${turn}:${step}`,
            turn,
            step,
            number: index + 1,
            request,
            messages: request !== undefined ? request.messages ?? [] : [],
            inputs,
            response,
            tools,
            usage: callUsage(response),
            status: callStatus(request, response, tools),
            startedAt: request !== undefined
              ? request.startedAt ?? (response !== undefined ? response.startedAt ?? null : null)
              : response !== undefined ? response.startedAt ?? null : null,
            durationMs: callDuration(request, cells),
          }];
        });
        const timing = timings.get(turn);
        const openingPrompt = preview(opening);
        const prompt = openingPrompt || `Turn ${turn}`;
        return [{
          turn,
          prompt,
          promptPreview: truncatePrompt(prompt),
          hasPrompt: openingPrompt !== '',
          startedAt: timing !== undefined
            ? timing.startTime ?? (opening !== undefined ? opening.startedAt ?? null : null) ?? (calls[0] !== undefined ? calls[0].startedAt : null)
            : (opening !== undefined ? opening.startedAt ?? null : null) ?? (calls[0] !== undefined ? calls[0].startedAt : null),
          durationMs: turnDuration(turn, calls, timings),
          calls,
          toolCount: calls.reduce((total, call) => total + call.tools.length, 0),
          status: turnStatus(calls),
        }];
      });
      const starts = workflowTurns
        .map(turn => turn.startedAt)
        .filter(value => value !== null);
      const ends = workflowTurns.flatMap(turn => turn.startedAt === null || turn.durationMs === null
        ? []
        : [turn.startedAt + turn.durationMs]);
      return {
        turns: workflowTurns,
        requestCount: workflowTurns.reduce((total, turn) => total + turn.calls.length, 0),
        toolCount: workflowTurns.reduce((total, turn) => total + turn.toolCount, 0),
        durationMs: starts.length === 0 || ends.length === 0
          ? null
          : Math.max(0, Math.max(...ends) - Math.min(...starts)),
      };
    }
    
    //#endregion
    //#region src/client/builder.js
    /**
     * Workflow target envelope + snapshot builder for the uiConversation view
     * registry. Ported from the 0.1.2 upstream trajectory builder (target
     * "workflow") and extended with the reference's surface-ledger step so every
     * assistant request carries the complete provider-neutral messages array.
     */
    
    const EMPTY_LIST = [];
    
    /** Stable empty target used until a Session has assembled Workflow records. */
    const EMPTY_WORKFLOW_SNAPSHOT = Object.freeze({
      eventNodes: Object.freeze(EMPTY_LIST),
      eventLocations: new Map(),
      requests: Object.freeze(EMPTY_LIST),
      callSchemas: new Map(),
      partial: null,
      runningCalls: Object.freeze(EMPTY_LIST),
    });
    
    function workflowNode(context, anchorSeq, data) {
      return {
        key: context.key,
        kind: context.kind,
        id: context.id,
        target: 'workflow',
        anchorSeq,
        location: context.start !== undefined && context.start.location !== undefined
          ? context.start.location
          : { kind: 'unresolved' },
        data,
      };
    }
    
    function stepKey(turn, step) {
      return `${turn}\u0000${step}`;
    }
    
    function headerStepKey(header) {
      const location = header.location;
      return location.kind === 'step' ? stepKey(location.turn.turn, location.step.step) : undefined;
    }
    
    function headerFor(request, headersByStep, previous) {
      return headersByStep.get(stepKey(request.turn, request.step))
        ?? (previous !== undefined && previous.seq < request.startSeq
          ? {
            latest: previous,
            ...(previous.change === undefined ? {} : { change: previous.change }),
          }
          : undefined);
    }
    
    function applyHeader(request, header, includeChange) {
      return header === undefined
        ? request
        : {
          ...request,
          prompt: header.latest.prompt,
          requestConfig: header.latest.prompt.config,
          ...(includeChange && header.change !== undefined ? { promptChange: header.change } : {}),
        };
    }
    
    function withRequestConfig(node, prompt) {
      return prompt === undefined ? node : { ...node, requestConfig: prompt.config };
    }
    
    function captureSchemas(block, toolsByName, output) {
      const name = 'kind' in block ? block.call !== null ? block.call.name : undefined : block.name;
      const schema = name === undefined ? undefined : toolsByName.get(name);
      if (schema !== undefined) output.set(block.callId, schema);
      for (const child of block.subCalls) captureSchemas(child, toolsByName, output);
    }
    
    function indexTools(tools) {
      return new Map(tools.map((tool) => [tool.name, tool]));
    }
    
    const COMPACTION_INTERRUPTED_ERROR = 'Compaction was interrupted before completion.';
    
    function interruptCompactions(requests, boundaries) {
      let nextRequest = 0;
      const runningCompactions = [];
      for (const boundary of boundaries) {
        while (nextRequest < requests.length) {
          const request = requests[nextRequest];
          if (request === undefined || request.startSeq >= boundary.seq) break;
          if (request.purpose === 'compaction' && request.status === 'running') {
            runningCompactions.push(nextRequest);
          }
          nextRequest++;
        }
        // Interrupt all running compactions accumulated before this boundary (supports concurrent compactions via replay)
        while (runningCompactions.length > 0) {
          let index = runningCompactions.pop();
          while (index !== undefined && requests[index] !== undefined && requests[index].status !== 'running') {
            index = runningCompactions.pop();
          }
          if (index === undefined) break;
          const request = requests[index];
          if (request === undefined || request.purpose !== 'compaction') continue;
          requests[index] = {
            ...request,
            completedAt: boundary.time,
            status: 'error',
            error: COMPACTION_INTERRUPTED_ERROR,
          };
        }
      }
    }
    
    function applyTurnErrors(requests, endings) {
      const lastAssistantByTurn = new Map();
      for (const [index, request] of requests.entries()) {
        if (request.purpose === 'assistant') lastAssistantByTurn.set(request.turn, index);
      }
      for (const ending of endings) {
        if (ending.error === undefined) continue;
        const index = lastAssistantByTurn.get(ending.turn);
        if (index === undefined) continue;
        const request = requests[index];
        if (request === undefined || request.purpose !== 'assistant') continue;
        requests[index] = {
          ...request,
          completedAt: request.completedAt !== null ? request.completedAt : ending.time,
          status: 'error',
          error: ending.error,
          ...(ending.errorCode === undefined ? {} : { errorCode: ending.errorCode }),
        };
      }
    }
    
    // ---------------------------------------------------------------------------
    // Surface ledger: reconstruct each assistant request's complete messages.
    // ---------------------------------------------------------------------------
    
    function applySurfaceRecord(entries, record) {
      const next = { seq: record.seq, message: record.message };
      const operation = record.operation;
      if (operation.kind === 'append') {
        entries.push(next);
        return;
      }
      const start = entries.findIndex(entry => entry.seq === operation.start);
      const end = entries.findIndex(entry => entry.seq === operation.end);
      if (start === -1 || end === -1 || start > end) {
        if (typeof console !== 'undefined' && console.warn) console.warn('[dsh-agent-workflow] surface replace range not found, appending', operation);
        entries.push(next);
        return;
      }
      entries.splice(start, end - start + 1, next);
    }
    
    function attachRequestMessages(requests, records) {
      const entries = [];
      let recordIndex = 0;
      for (const [requestIndex, request] of requests.entries()) {
        if (request.purpose !== 'assistant') continue;
        const boundary = request.resultSeq !== undefined
          ? request.resultSeq
          : request.completedSeq !== undefined ? request.completedSeq : Number.POSITIVE_INFINITY;
        while ((records[recordIndex] !== undefined ? records[recordIndex].seq : Number.POSITIVE_INFINITY) < boundary) {
          applySurfaceRecord(entries, records[recordIndex]);
          recordIndex++;
        }
        requests[requestIndex] = {
          ...request,
          messages: entries.flatMap(entry => entry.message === null ? [] : [entry.message]),
        };
      }
    }
    
    // ---------------------------------------------------------------------------
    // Builder + view definition.
    // ---------------------------------------------------------------------------
    
    class WorkflowSnapshotBuilder {
      constructor() {
        this.nodes = new Map();
        this.positions = new Map();
        this.contributions = [];
      }
    
      replace(input) {
        this.nodes.clear();
        for (const node of input.nodes) this.nodes.set(node.key, node);
        this.rebuildContributions();
        return this.snapshot();
      }
    
      apply(input) {
        let structural = false;
        for (const node of input.upserts) {
          const previous = this.nodes.get(node.key);
          this.nodes.set(node.key, node);
          if (previous === undefined || previous.anchorSeq !== node.anchorSeq) {
            structural = true;
            continue;
          }
          const position = this.positions.get(node.key);
          if (position === undefined) structural = true;
          else this.contributions[position] = node;
        }
        if (structural) this.rebuildContributions();
        return this.snapshot();
      }
    
      snapshot() {
        const headersByStep = new Map();
        for (const contribution of this.contributions) {
          if (contribution.data.kind !== 'request-header') continue;
          const key = headerStepKey(contribution.data.header);
          if (key === undefined) continue;
          const previous = headersByStep.get(key);
          headersByStep.set(key, {
            latest: contribution.data.header,
            ...(contribution.data.header.change !== undefined ? { change: contribution.data.header.change } : {}),
          });
        }
        const finalized = [];
        const eventLocations = new Map();
        const requests = [];
        const boundaries = [];
        const turnEndings = [];
        const callSchemas = new Map();
        const surfaceRecords = [];
        const consumedPromptChanges = new Set();
        let previousHeader;
        let previousTools = new Map();
        let partial = null;
        const runningCalls = [];
    
        for (const contribution of this.contributions) {
          const data = contribution.data;
          if (data.kind === 'request-header') {
            previousHeader = data.header;
            previousTools = indexTools(data.header.prompt.tools);
            continue;
          }
          if (data.kind === 'surface') {
            surfaceRecords.push(data.record);
            continue;
          }
          if (data.kind === 'node') {
            finalized.push(data.node);
            eventLocations.set(data.node.seq, contribution.location);
            continue;
          }
          if (data.kind === 'assistant') {
            const header = data.request === undefined
              ? undefined
              : headerFor(data.request, headersByStep, previousHeader);
            if (data.node !== undefined) finalized.push(withRequestConfig(data.node, header !== undefined ? header.latest.prompt : undefined));
            if (data.partial !== null) partial = data.partial;
            if (data.request !== undefined) {
              const change = header !== undefined ? header.change : undefined;
              const includeChange = change !== undefined && !consumedPromptChanges.has(change.seq);
              requests.push(applyHeader(data.request, header, includeChange));
              if (includeChange) consumedPromptChanges.add(change.seq);
            }
            continue;
          }
          if (data.kind === 'tool') {
            if ('kind' in data.root) finalized.push(data.root);
            else runningCalls.push(data.root);
            if (previousHeader !== undefined && previousHeader.seq <= contribution.anchorSeq) {
              captureSchemas(data.root, previousTools, callSchemas);
            }
            continue;
          }
          if (data.kind === 'compaction') {
            requests.push(data.request);
            continue;
          }
          if (data.kind === 'session-end') {
            boundaries.push({ seq: data.seq, time: data.time });
            continue;
          }
          turnEndings.push({
            turn: data.turn,
            time: data.time,
            ...(data.error === undefined ? {} : { error: data.error }),
            ...(data.errorCode === undefined ? {} : { errorCode: data.errorCode }),
          });
        }
    
        requests.sort((left, right) => left.startSeq - right.startSeq);
        interruptCompactions(requests, boundaries);
        applyTurnErrors(requests, turnEndings);
        attachRequestMessages(requests, surfaceRecords);
        finalized.sort((left, right) => left.seq - right.seq);
        return {
          eventNodes: finalized,
          eventLocations,
          requests,
          callSchemas,
          partial,
          runningCalls,
        };
      }
    
      rebuildContributions() {
        this.contributions = [...this.nodes.values()]
          .sort((left, right) => left.anchorSeq - right.anchorSeq || left.key.localeCompare(right.key));
        this.positions.clear();
        for (const [index, contribution] of this.contributions.entries()) {
          this.positions.set(contribution.key, index);
        }
      }
    }
    
    /** Workflow target factory preserving the existing stage-oriented view model. */
    const workflowViewDefinition = {
      target: 'workflow',
      create: () => new WorkflowSnapshotBuilder(),
    };
    
    /**
     * Register the stage-oriented Workflow target builder.
     * @param ctx - Plugin context receiving the view Definition.
     */
    function registerWorkflowConversationView(ctx) {
      ctx.uiConversation.views.register(workflowViewDefinition);
    }
    
    //#endregion
    //#region src/client/definitions.js
    /**
     * Workflow-owned event Definitions for the uiConversation projection engine
     * (target "workflow"). Ported from the upstream trajectory definitions onto
     * the 0.1.2 event model — the same replay-safe state machines with a
     * Workflow-owned target, so replay cannot modify or short-circuit Chat and
     * Trajectory projections.
     */
    
    // ---------------------------------------------------------------------------
    // Event projection helpers (previously shared by dsh-client-runtime).
    // ---------------------------------------------------------------------------
    
    function asRecord(value) {
      return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : null;
    }
    function readString(record, key) {
      const value = record[key];
      return typeof value === 'string' && value.length > 0 ? value : null;
    }
    function collect(source, member, field) {
      const list = source[member];
      if (!Array.isArray(list)) return [];
      const seen = [];
      for (const entry of list) {
        const record = asRecord(entry);
        const value = record === null ? null : readString(record, field);
        if (value !== null && !seen.includes(value)) seen.push(value);
      }
      return seen;
    }
    function joined(names) {
      return names.length > 0 ? names.join(', ') : null;
    }
    const KNOWN_FORMS = ['instructions', 'catalog', 'snapshot', 'notice', 'relay', 'recall'];
    function contextForm(source) {
      const record = asRecord(source);
      const form = record === null ? null : readString(record, 'form');
      return form !== null && KNOWN_FORMS.includes(form) ? form : null;
    }
    function contextProvenance(source) {
      const record = asRecord(source);
      const kind = record === null ? null : readString(record, 'kind');
      if (record === null || kind === null) return { role: 'inject', label: null };
      switch (kind) {
        case 'session-reference': return {
          role: 'recall',
          label: joined(collect(record, 'references', 'label')) ?? kind,
        };
        case 'agent-instructions': return {
          role: 'inject',
          label: joined(collect(record, 'changes', 'path')) ?? kind,
        };
        case 'plugin': return {
          role: 'inject',
          label: readString(record, 'plugin') ?? kind,
        };
        case 'skill-invocation': return {
          role: 'inject',
          label: readString(record, 'name') ?? kind,
        };
        default: return { role: 'inject', label: kind };
      }
    }
    function toAssistantBlocks(content) {
      return content.map(toAssistantBlock);
    }
    function toAssistantBlock(block) {
      switch (block.type) {
        case 'text': return { kind: 'text', text: block.text };
        case 'reasoning': return { kind: 'reasoning', text: block.text };
        case 'image': return { kind: 'image', attachment: block.attachment };
        case 'tool-call': return {
          kind: 'tool-call',
          callId: String(block.id),
          name: block.name,
          argsRaw: block.arguments,
        };
        default: return { kind: 'other', block };
      }
    }
    function emptyAssistantBlock(blockType) {
      switch (blockType) {
        case 'text': return { kind: 'text', text: '' };
        case 'reasoning': return { kind: 'reasoning', text: '' };
        case 'tool-call': return { kind: 'tool-call', callId: '', name: '', argsRaw: '' };
        default: return { kind: 'other', block: null };
      }
    }
    function displayFailure(failure) {
      if (failure === null || typeof failure !== 'object') return { message: String(failure) };
      const record = failure;
      const code = typeof record.code === 'string' ? record.code : undefined;
      if (code === 'AUTH') return { code, message: '' };
      return {
        ...(code === undefined ? {} : { code }),
        message: typeof record.message === 'string' ? record.message : JSON.stringify(failure),
      };
    }
    function isTokenDelta(chunk) {
      switch (chunk.type) {
        case 'text-delta':
        case 'reasoning-delta': return chunk.text !== '';
        case 'tool-call-delta': return chunk.argumentsDelta !== '' || chunk.name !== undefined;
        default: return false;
      }
    }
    
    // ---------------------------------------------------------------------------
    // Surface records (per-request messages reconstruction). The upstream 0.1.2
    // builder dropped these; the Workflow view keeps the request messages ledger,
    // so the surface definition is retained and the helpers inlined from
    // @deepseek-ai/dsh-session/surface.
    // ---------------------------------------------------------------------------
    
    const SURFACE_EVENT_TYPES = new Set(['user/message', 'assistant/message', 'tool/result']);
    function isSurfaceEvent(event) {
      return SURFACE_EVENT_TYPES.has(event.type) && event.surfaceOp !== undefined;
    }
    function isAppendSurfaceEvent(event) {
      return isSurfaceEvent(event) && event.surfaceOp === 'append';
    }
    function isReplacementSurfaceEvent(event) {
      return isSurfaceEvent(event) && event.surfaceOp !== 'append';
    }
    function deriveEventMessage(event) {
      switch (event.type) {
        case 'user/message': return event.data;
        case 'assistant/message': {
          if (event.data.message.content.length === 0) return null;
          return event.data.message;
        }
        case 'tool/result': return event.data.message;
        default: return null;
      }
    }
    
    // ---------------------------------------------------------------------------
    // Inbox + message definitions.
    // ---------------------------------------------------------------------------
    
    function applySplice(previous, splice) {
      const pending = [...(previous !== undefined ? previous.state.pending ?? [] : [])];
      const claimed = new Set(previous !== undefined ? previous.state.claimed ?? [] : []);
      const removed = pending.splice(splice.start, splice.removedCount ?? 0, ...splice.inserted);
      for (const identity of splice.inserted) claimed.delete(identity.id);
      if (splice.outcome !== 'canceled') for (const identity of removed) claimed.add(identity.id);
      return { pending, claimed };
    }
    
    const workflowInboxDefinition = {
      kind: 'workflow-inbox-next-step',
      match: (event) => event.type === 'agent/inbox/spliced' && event.data.target === 'next-step'
        ? { id: String(event.seq), role: 'start' }
        : null,
      start: (_context, match, reader) => {
        if (match.event.type !== 'agent/inbox/spliced') {
          throw new Error('workflow-inbox-next-step start requires agent/inbox/spliced');
        }
        return applySplice(reader.previous('workflow-inbox-next-step'), match.event.data);
      },
      update: (context) => context.state,
      publication: () => 'none',
    };
    
    const workflowMessageDefinition = {
      kind: 'workflow-input-message',
      target: 'workflow',
      match: (event) => event.type === 'user/message' ? { id: String(event.seq), role: 'start' } : null,
      start: (_context, match, reader) => {
        if (match.event.type !== 'user/message') {
          throw new Error('workflow-input-message start requires user/message');
        }
        const event = match.event;
        if (event.data.source.kind !== 'user') {
          return {
            kind: 'context',
            seq: event.seq,
            time: event.time,
            content: event.data.content,
            source: event.data.source,
            provenance: contextProvenance(event.data.source),
            form: contextForm(event.data.source),
          };
        }
        const previous = reader.previous('workflow-inbox-next-step');
        const claimed = previous !== undefined
          && previous.state.claimed.has(String(event.data.id)) === true;
        return claimed
          ? {
            kind: 'steering',
            messageId: event.data.id,
            seq: event.seq,
            time: event.time,
            content: event.data.content,
            source: event.data.source,
          }
          : {
            kind: 'user',
            seq: event.seq,
            time: event.time,
            content: event.data.content,
            source: event.data.source,
          };
      },
      update: (context) => context.state,
      buildViewNode: (context) => context.state === undefined
        ? null
        : workflowNode(context, context.state.seq, { kind: 'node', node: context.state }),
    };
    
    function registerWorkflowMessageDefinitions(ctx) {
      ctx.uiConversation.events.register(workflowInboxDefinition);
      ctx.uiConversation.events.register(workflowMessageDefinition);
    }
    
    // ---------------------------------------------------------------------------
    // Request-header definition.
    // ---------------------------------------------------------------------------
    
    function workflowRequestHeaderDefinition(inspect) {
      return {
        kind: 'workflow-request-header',
        target: 'workflow',
        match: (event) => event.type === 'request/header' ? { id: String(event.seq), role: 'start' } : null,
        start: (_context, match, reader) => {
          if (match.event.type !== 'request/header') {
            throw new Error('workflow-request-header start requires request/header');
          }
          const previous = reader.previous('workflow-request-header') !== undefined
            ? reader.previous('workflow-request-header').state.prompt
            : undefined;
          const { prompt, change } = inspect(previous, match.event);
          return {
            seq: match.event.seq,
            time: match.event.time,
            prompt,
            location: match.location,
            ...(change === undefined ? {} : { change }),
          };
        },
        update: (context) => context.state,
        buildViewNode: (context) => context.state === undefined
          ? null
          : workflowNode(context, context.state.seq, {
            kind: 'request-header',
            header: context.state,
          }),
      };
    }
    
    function registerWorkflowRequestHeaderDefinition(ctx) {
      ctx.uiConversation.events.register(
        workflowRequestHeaderDefinition((previous, event) =>
          ctx.uiConversation.inspectRequestPrompt(previous, event)),
      );
    }
    
    // ---------------------------------------------------------------------------
    // Surface definition.
    // ---------------------------------------------------------------------------
    
    const workflowSurfaceDefinition = {
      kind: 'workflow-surface-event',
      target: 'workflow',
      match: (event) => isAppendSurfaceEvent(event) || isReplacementSurfaceEvent(event)
        ? { id: String(event.seq), role: 'start' }
        : null,
      start: (_context, match) => {
        const event = match.event;
        if (!isAppendSurfaceEvent(event) && !isReplacementSurfaceEvent(event)) {
          throw new Error('workflow-surface-event start requires a surface event');
        }
        return {
          seq: event.seq,
          message: deriveEventMessage(event),
          operation: event.surfaceOp === 'append'
            ? { kind: 'append' }
            : { kind: 'replace', start: event.surfaceOp.start, end: event.surfaceOp.end },
        };
      },
      update: (context) => context.state,
      buildViewNode: (context) => context.state === undefined
        ? null
        : workflowNode(context, context.state.seq, { kind: 'surface', record: context.state }),
    };
    
    function registerWorkflowSurfaceDefinition(ctx) {
      ctx.uiConversation.events.register(workflowSurfaceDefinition);
    }
    
    // ---------------------------------------------------------------------------
    // Assistant streaming, settlement, and request lifecycle.
    // ---------------------------------------------------------------------------
    
    function isChunkRunEvent(event) {
      return event.type === 'chunkrow/text-chunks'
        || event.type === 'chunkrow/reasoning-chunks'
        || event.type === 'chunkrow/tool-call-chunks';
    }
    function initialState(turn, step, startSeq, startTime, started) {
      return {
        turn, step, startSeq, startTime, started,
        sawChunk: false,
        blocks: [],
        visibleBlocks: 0,
        firstVisibleSeq: undefined,
        firstVisibleTime: undefined,
        firstTokenTime: undefined,
        final: undefined,
        usage: undefined,
        retry: undefined,
        stepEnd: undefined,
      };
    }
    function compactBlocks(blocks) {
      return blocks.filter((block) => block !== undefined);
    }
    function blockIsVisible(block) {
      if (block === undefined || block.kind === 'tool-call') return false;
      if (block.kind === 'text' || block.kind === 'reasoning') return block.text.trim() !== '';
      return true;
    }
    function countVisibleBlocks(blocks) {
      let count = 0;
      for (const block of blocks) if (blockIsVisible(block)) count++;
      return count;
    }
    function hasInterruptionEvidence(blocks) {
      return blocks.some((block) => {
        if (block.kind === 'text' || block.kind === 'reasoning') return block.text.trim() !== '';
        return true;
      });
    }
    function addUsage$1(current, next) {
      return {
        inputTokens: (current !== undefined ? current.inputTokens ?? 0 : 0) + next.inputTokens,
        outputTokens: (current !== undefined ? current.outputTokens ?? 0 : 0) + next.outputTokens,
        ...(current !== undefined && current.cacheReadTokens !== undefined
            || next.cacheReadTokens !== undefined
          ? { cacheReadTokens: (current !== undefined ? current.cacheReadTokens ?? 0 : 0) + (next.cacheReadTokens ?? 0) }
          : {}),
        ...(current !== undefined && current.cacheWriteTokens !== undefined
            || next.cacheWriteTokens !== undefined
          ? { cacheWriteTokens: (current !== undefined ? current.cacheWriteTokens ?? 0 : 0) + (next.cacheWriteTokens ?? 0) }
          : {}),
        ...(current !== undefined && current.reasoningTokens !== undefined
            || next.reasoningTokens !== undefined
          ? { reasoningTokens: (current !== undefined ? current.reasoningTokens ?? 0 : 0) + (next.reasoningTokens ?? 0) }
          : {}),
      };
    }
    function updateChunk(state, match) {
      if (match.event.type !== 'assistant/chunk') return state;
      const chunk = match.event.data.chunk;
      if (chunk.type === 'usage') {
        return { ...state, sawChunk: true, usage: addUsage$1(state.usage, chunk.usage) };
      }
      const blocks = [...state.blocks];
      let changedIndex = -1;
      let previousVisible = false;
      switch (chunk.type) {
        case 'block-start':
          changedIndex = chunk.index;
          previousVisible = blockIsVisible(blocks[chunk.index]);
          blocks[chunk.index] = emptyAssistantBlock(chunk.blockType);
          break;
        case 'text-delta': {
          const previous = blocks[chunk.index];
          changedIndex = chunk.index;
          previousVisible = blockIsVisible(previous);
          blocks[chunk.index] = {
            kind: 'text',
            text: (previous !== undefined && previous.kind === 'text' ? previous.text : '') + chunk.text,
          };
          break;
        }
        case 'reasoning-delta': {
          const previous = blocks[chunk.index];
          changedIndex = chunk.index;
          previousVisible = blockIsVisible(previous);
          blocks[chunk.index] = {
            kind: 'reasoning',
            text: (previous !== undefined && previous.kind === 'reasoning' ? previous.text : '') + chunk.text,
          };
          break;
        }
        case 'tool-call-delta': {
          const previous = blocks[chunk.index];
          changedIndex = chunk.index;
          previousVisible = blockIsVisible(previous);
          const base = previous !== undefined && previous.kind === 'tool-call'
            ? previous
            : { kind: 'tool-call', callId: '', name: '', argsRaw: '' };
          blocks[chunk.index] = {
            kind: 'tool-call',
            callId: base.callId || String(chunk.id),
            name: chunk.name !== undefined ? chunk.name : base.name,
            argsRaw: base.argsRaw + chunk.argumentsDelta,
          };
          break;
        }
        case 'block-end':
          changedIndex = chunk.index;
          previousVisible = blockIsVisible(blocks[chunk.index]);
          blocks[chunk.index] = toAssistantBlock(chunk.block);
          break;
        default: return { ...state, sawChunk: true };
      }
      const visibleBlocks = state.visibleBlocks - Number(previousVisible) + Number(blockIsVisible(blocks[changedIndex]));
      return {
        ...state,
        sawChunk: true,
        blocks,
        visibleBlocks,
        ...(visibleBlocks > 0 && state.firstVisibleSeq === undefined
          ? { firstVisibleSeq: match.event.seq, firstVisibleTime: match.event.time }
          : {}),
        ...(isTokenDelta(chunk) && state.firstTokenTime === undefined
          ? { firstTokenTime: match.event.time }
          : {}),
      };
    }
    function chunkRunBoundaries(event, needsToken, needsVisible, visibleFromStart) {
      const fragments = event.type === 'chunkrow/tool-call-chunks' ? event.data.args : event.data.texts;
      const nameStartsToken = event.type === 'chunkrow/tool-call-chunks' && Object.hasOwn(event.data, 'name');
      let firstTokenTime;
      let firstVisible;
      let time = event.time;
      for (let index = 0; index < fragments.length; index++) {
        const fragment = fragments[index];
        if (needsToken && firstTokenTime === undefined && (nameStartsToken || fragment !== '')) firstTokenTime = time;
        if (needsVisible && firstVisible === undefined
          && (visibleFromStart || event.type !== 'chunkrow/tool-call-chunks' && fragment.trim() !== '')) {
          firstVisible = { seq: event.seq + index, time };
        }
        if ((!needsToken || firstTokenTime !== undefined)
          && (!needsVisible || firstVisible !== undefined)) break;
        time += (event.data.dt !== undefined ? event.data.dt[index] ?? 0 : 0);
      }
      return { firstTokenTime, firstVisible };
    }
    function updateChunkRun(state, event) {
      const blocks = [...state.blocks];
      const previous = blocks[event.data.index];
      const previousVisible = blockIsVisible(previous);
      let visibleFromStart = state.visibleBlocks - Number(previousVisible) > 0;
      if (event.type === 'chunkrow/text-chunks') {
        const text = previous !== undefined && previous.kind === 'text' ? previous.text : '';
        visibleFromStart = visibleFromStart || text.trim() !== '';
        blocks[event.data.index] = { kind: 'text', text: text + event.data.texts.join('') };
      } else if (event.type === 'chunkrow/reasoning-chunks') {
        const text = previous !== undefined && previous.kind === 'reasoning' ? previous.text : '';
        visibleFromStart = visibleFromStart || text.trim() !== '';
        blocks[event.data.index] = { kind: 'reasoning', text: text + event.data.texts.join('') };
      } else {
        const base = previous !== undefined && previous.kind === 'tool-call'
          ? previous
          : { kind: 'tool-call', callId: '', name: '', argsRaw: '' };
        blocks[event.data.index] = {
          kind: 'tool-call',
          callId: base.callId || String(event.data.id),
          name: Object.hasOwn(event.data, 'name') ? event.data.name : base.name,
          argsRaw: base.argsRaw + event.data.args.join(''),
        };
      }
      const boundaries = chunkRunBoundaries(
        event,
        state.firstTokenTime === undefined,
        state.firstVisibleSeq === undefined,
        visibleFromStart,
      );
      const visibleBlocks = state.visibleBlocks - Number(previousVisible) + Number(blockIsVisible(blocks[event.data.index]));
      return {
        ...state,
        sawChunk: true,
        blocks,
        visibleBlocks,
        ...(boundaries.firstVisible === undefined
          ? {}
          : { firstVisibleSeq: boundaries.firstVisible.seq, firstVisibleTime: boundaries.firstVisible.time }),
        ...(boundaries.firstTokenTime === undefined ? {} : { firstTokenTime: boundaries.firstTokenTime }),
      };
    }
    function closedBoundary(context) {
      if (context.state !== undefined && context.state.stepEnd !== undefined
        && context.state.stepEnd.event.type === 'step/end') {
        return context.state.stepEnd.event;
      }
      const location = context.start !== undefined && context.start.location !== undefined
        ? context.start.location
        : context.matches.at(-1) !== undefined ? context.matches.at(-1).location : undefined;
      if (location !== undefined && location.kind === 'step' && location.step.status === 'closed') {
        return location.step.end;
      }
      if (location !== undefined
        && (location.kind === 'step' || location.kind === 'turn')
        && location.turn.status === 'closed') return location.turn.end;
      return undefined;
    }
    function fallbackState$1(context) {
      let state;
      for (const match of context.matches) {
        if (isChunkRunEvent(match.event)) {
          state = state === undefined
            ? initialState(match.event.data.turn, match.event.data.step, match.event.seq, match.event.time, false)
            : state;
          state = updateChunkRun(state, match.event);
          continue;
        }
        const event = match.event;
        if (event.type === 'assistant/chunk') {
          state = state === undefined
            ? initialState(event.data.turn, event.data.step, event.seq, event.time, false)
            : state;
          state = updateChunk(state, match);
        } else if (event.type === 'assistant/message') {
          state = state === undefined
            ? initialState(event.data.turn, event.data.step, event.seq, event.time, false)
            : state;
          const blocks = toAssistantBlocks(event.data.message.content);
          state = {
            ...state,
            blocks,
            visibleBlocks: countVisibleBlocks(blocks),
            final: match,
            usage: state.usage !== undefined ? state.usage : event.data.usage,
          };
        } else if (event.type === 'step/end' && state !== undefined) {
          state = { ...state, stepEnd: match };
        }
      }
      return state;
    }
    function finalNode(state, context) {
      const final = state.final;
      if (final !== undefined && final.event.type === 'assistant/message') {
        const event = final.event;
        return {
          kind: 'assistant',
          seq: event.seq,
          messageId: event.data.message.id,
          time: event.time,
          turn: state.turn,
          step: state.step,
          blocks: toAssistantBlocks(event.data.message.content),
          usage: event.data.usage,
          provenance: {
            provider: event.data.message.source.provider,
            model: event.data.message.source.model,
          },
          timing: {
            stepStartTime: state.started ? state.startTime : null,
            firstTokenTime: state.firstTokenTime !== undefined ? state.firstTokenTime : null,
            completedTime: event.time,
          },
          ...(event.data.interrupted === true ? { interrupted: true } : {}),
        };
      }
      const boundary = closedBoundary(context);
      if (boundary === undefined) return undefined;
      const blocks = compactBlocks(state.blocks);
      if (!hasInterruptionEvidence(blocks)) return undefined;
      return {
        kind: 'assistant',
        seq: boundary.seq - 0.9,
        time: boundary.time,
        turn: state.turn,
        step: state.step,
        blocks,
        interrupted: true,
      };
    }
    function assistantRequest(state, node, boundary) {
      if (!state.started) return undefined;
      const status = node !== undefined && node.interrupted !== true
        ? 'complete'
        : state.retry !== undefined || boundary !== undefined ? 'error' : 'running';
      return {
        purpose: 'assistant',
        startSeq: state.startSeq,
        turn: state.turn,
        step: state.step,
        startedAt: state.startTime,
        completedAt: node !== undefined ? node.time : boundary !== undefined ? boundary.time : null,
        status,
        ...(state.retry === undefined
          ? {}
          : {
            error: state.retry.message,
            ...(state.retry.code === undefined ? {} : { errorCode: state.retry.code }),
            retry: state.retry.retry,
            ...(state.retry.maxRetries === undefined ? {} : { maxRetries: state.retry.maxRetries }),
            retryDelayMs: state.retry.delayMs,
          }),
        ...(node !== undefined && node.messageId === undefined
          ? {}
          : node !== undefined
            ? {
              resultSeq: node.seq,
              ...(node.provenance === undefined ? {} : { provenance: node.provenance }),
            }
            : {}),
        // Workflow extension: a chunk-only fallback has no durable message to
        // anchor message assembly, so retain the closing boundary as its edge.
        ...(node !== undefined && node.messageId !== undefined || boundary === undefined
          ? {}
          : { completedSeq: boundary.seq }),
        ...(state.usage === undefined ? {} : { usage: state.usage }),
      };
    }
    const workflowAssistantDefinition = {
      kind: 'workflow-assistant-step',
      target: 'workflow',
      match: (event) => {
        if (event.type === 'step/start') {
          return { id: `${event.data.turn}:${event.data.step}`, role: 'start' };
        }
        if (event.type === 'assistant/chunk'
          || event.type === 'assistant/message'
          || event.type === 'llm/retry'
          || event.type === 'step/end') {
          return { id: `${event.data.turn}:${event.data.step}`, role: 'update' };
        }
        if (isChunkRunEvent(event)) {
          return { id: `${event.data.turn}:${event.data.step}`, role: 'update' };
        }
        return null;
      },
      start: (_context, match) => {
        if (match.event.type !== 'step/start') {
          throw new Error('workflow-assistant-step start requires step/start');
        }
        return initialState(match.event.data.turn, match.event.data.step, match.event.seq, match.event.time, true);
      },
      update: (context, match) => {
        if (isChunkRunEvent(match.event)) return updateChunkRun(context.state, match.event);
        if (match.event.type === 'assistant/chunk') return updateChunk(context.state, match);
        if (match.event.type === 'assistant/message') {
          const blocks = toAssistantBlocks(match.event.data.message.content);
          return {
            ...context.state,
            blocks,
            visibleBlocks: countVisibleBlocks(blocks),
            final: match,
            usage: context.state.usage !== undefined ? context.state.usage : match.event.data.usage,
          };
        }
        if (match.event.type === 'step/end') return { ...context.state, stepEnd: match };
        if (match.event.type !== 'llm/retry') return context.state;
        const data = match.event.data;
        const failure = displayFailure(data.failure);
        return {
          ...initialState(context.state.turn, context.state.step, context.state.startSeq, context.state.startTime, true),
          firstTokenTime: context.state.firstTokenTime,
          usage: context.state.usage,
          retry: {
            message: failure.message,
            ...(failure.code === undefined ? {} : { code: failure.code }),
            retry: data.retry,
            ...(data.mode === 'normal' ? { maxRetries: data.maxRetries } : {}),
            delayMs: data.delayMs,
          },
        };
      },
      publication: (match) => {
        if (match.event.type === 'step/start') return 'none';
        if (isChunkRunEvent(match.event)) return 'animation-frame';
        if (match.event.type !== 'assistant/chunk') return 'immediate';
        const type = match.event.data.chunk.type;
        return type === 'usage' || type === 'finish' ? 'none' : 'animation-frame';
      },
      buildViewNode: (context) => {
        const state = context.state !== undefined ? context.state : fallbackState$1(context);
        if (state === undefined) return null;
        const node = finalNode(state, context);
        const boundary = closedBoundary(context);
        const partial = node === undefined && boundary === undefined && state.sawChunk
          ? { turn: state.turn, step: state.step, blocks: compactBlocks(state.blocks) }
          : null;
        const request = assistantRequest(state, node, boundary);
        if (node === undefined && partial === null && request === undefined) return null;
        return workflowNode(context, state.startSeq, {
          kind: 'assistant',
          ...(node === undefined ? {} : { node }),
          partial,
          ...(request === undefined ? {} : { request }),
        });
      },
    };
    
    const workflowTurnEndDefinition = {
      kind: 'workflow-turn-end',
      target: 'workflow',
      match: (event) => event.type === 'turn/end' ? { id: String(event.seq), role: 'start' } : null,
      start: (_context, match) => {
        if (match.event.type !== 'turn/end') {
          throw new Error('workflow-turn-end start requires turn/end');
        }
        const reason = match.event.data.reason;
        const failure = reason.kind === 'error' ? displayFailure(reason.error) : undefined;
        return {
          turn: match.event.data.turn,
          seq: match.event.seq,
          time: match.event.time,
          ...(failure === undefined
            ? {}
            : {
              error: failure.message,
              ...(failure.code === undefined ? {} : { errorCode: failure.code }),
            }),
        };
      },
      update: (context) => context.state,
      buildViewNode: (context) => context.state === undefined
        ? null
        : workflowNode(context, context.state.seq, {
          kind: 'turn-end',
          turn: context.state.turn,
          time: context.state.time,
          ...(context.state.error === undefined ? {} : { error: context.state.error }),
          ...(context.state.errorCode === undefined ? {} : { errorCode: context.state.errorCode }),
        }),
    };
    
    function registerWorkflowAssistantDefinition(ctx) {
      ctx.uiConversation.events.register(workflowAssistantDefinition);
      ctx.uiConversation.events.register(workflowTurnEndDefinition);
    }
    
    // ---------------------------------------------------------------------------
    // Root Tool lifecycle with nested Code Dispatch calls.
    // ---------------------------------------------------------------------------
    
    const MAX_DEPTH = 256;
    function rootCall(match) {
      if (match.event.type !== 'tool/call') throw new Error('workflow-tool-call start requires tool/call');
      return {
        callId: String(match.event.data.callId),
        name: match.event.data.name,
        argsRaw: match.event.data.arguments,
        turn: match.event.data.turn,
        step: match.event.data.step,
        time: match.event.time,
        subCalls: [],
      };
    }
    function rootResult(match, previous) {
      if (match.event.type !== 'tool/result') return undefined;
      const result = match.event.data.message.content[0];
      return {
        kind: 'tool-result',
        seq: match.event.seq,
        time: match.event.time,
        callId: String(match.event.data.message.source.callId),
        call: previous === undefined ? null : { name: previous.name, argsRaw: previous.argsRaw },
        callTime: previous !== undefined ? previous.time ?? null : null,
        content: result.content,
        isError: result.isError === true,
        ...(match.event.data.error === undefined ? {} : { error: match.event.data.error }),
        meta: match.event.data.meta,
        subCalls: [],
      };
    }
    function locationTurn(match) {
      return match.location.kind === 'step' || match.location.kind === 'turn'
        ? match.location.turn.turn
        : 0;
    }
    function locationStep(match) {
      return match.location.kind === 'step' ? match.location.step.step : 0;
    }
    function childCall(match, data) {
      return {
        callId: data.subCallId,
        parentCallId: data.parentCallId,
        name: data.name,
        argsRaw: JSON.stringify(data.arguments),
        turn: locationTurn(match),
        step: locationStep(match),
        time: match.event.time,
        subCalls: [],
      };
    }
    function childResult(match, data, previous) {
      return {
        kind: 'tool-result',
        seq: match.event.seq,
        time: match.event.time,
        callId: data.subCallId,
        parentCallId: data.parentCallId,
        call: { name: data.name, argsRaw: JSON.stringify(data.arguments) },
        callTime: previous === undefined || 'kind' in previous ? null : previous.time,
        content: data.content !== undefined ? data.content : [],
        isError: data.isError === true,
        subCalls: [],
      };
    }
    function acceptsEdge(state, parent, child) {
      if (parent === child || state.parents.has(child)) return false;
      let cursor = parent;
      let parentDepth = 0;
      const ancestors = new Set();
      while (cursor !== undefined) {
        if (cursor === child || ancestors.has(cursor)) return false;
        ancestors.add(cursor);
        parentDepth++;
        cursor = state.parents.get(cursor);
      }
      const pending = [{ callId: child, depth: 1 }];
      const descendants = new Set();
      let subtreeDepth = 0;
      for (const candidate of pending) {
        if (descendants.has(candidate.callId)) return false;
        descendants.add(candidate.callId);
        subtreeDepth = Math.max(subtreeDepth, candidate.depth);
        for (const nested of state.children.get(candidate.callId) ?? []) {
          pending.push({ callId: nested, depth: candidate.depth + 1 });
        }
      }
      return parentDepth + subtreeDepth <= MAX_DEPTH;
    }
    function updateDispatch(state, match) {
      const event = match.event;
      if (event.type !== 'tool/code-dispatch-start' && event.type !== 'tool/code-dispatch') return state;
      const data = event.data;
      const parentId = String(data.parentCallId);
      const childId = String(data.subCallId);
      const siblings = state.children.get(parentId) ?? [];
      const index = siblings.indexOf(childId);
      if (index < 0 && !acceptsEdge(state, parentId, childId)) return state;
      if (event.type === 'tool/code-dispatch-start' && index >= 0) return state;
      const calls = new Map(state.calls);
      calls.set(childId, event.type === 'tool/code-dispatch-start'
        ? childCall(match, data)
        : childResult(match, data, calls.get(childId)));
      if (index >= 0) return { ...state, calls };
      const children = new Map(state.children);
      children.set(parentId, [...siblings, childId]);
      const parents = new Map(state.parents);
      parents.set(childId, parentId);
      return { ...state, calls, children, parents };
    }
    function interruption(context) {
      const location = context.start !== undefined && context.start.location !== undefined
        ? context.start.location
        : undefined;
      if (location !== undefined && location.kind === 'step' && location.step.status === 'closed') {
        return location.step.end;
      }
      if (location !== undefined
        && (location.kind === 'step' || location.kind === 'turn')
        && location.turn.status === 'closed') return location.turn.end;
      return undefined;
    }
    function projectCall(state, callId, interruptedAt, visited, depth) {
      visited = visited !== undefined ? visited : new Set();
      depth = depth !== undefined ? depth : 1;
      const block = state.calls.get(callId);
      if (block === undefined) return undefined;
      if (visited.has(callId) || depth > MAX_DEPTH) return { ...block, subCalls: [] };
      const nextVisited = new Set(visited);
      nextVisited.add(callId);
      const subCalls = (state.children.get(callId) ?? []).flatMap((childId) => {
        const child = projectCall(state, childId, interruptedAt, nextVisited, depth + 1);
        return child === undefined ? [] : [child];
      });
      if ('kind' in block || interruptedAt === undefined) return { ...block, subCalls };
      return {
        kind: 'tool-result',
        seq: interruptedAt.seq - 0.8,
        time: interruptedAt.time,
        callId: block.callId,
        ...(block.parentCallId === undefined ? {} : { parentCallId: block.parentCallId }),
        call: { name: block.name, argsRaw: block.argsRaw },
        callTime: block.time,
        content: [],
        isError: true,
        error: { name: 'Interrupted', code: 'interrupted' },
        subCalls,
      };
    }
    function fallbackState(context) {
      const resultMatch = context.matches.find((match) => match.event.type === 'tool/result');
      const root = resultMatch === undefined ? undefined : rootResult(resultMatch);
      if (root === undefined) return undefined;
      let state = {
        rootId: root.callId,
        calls: new Map([[root.callId, root]]),
        children: new Map(),
        parents: new Map(),
      };
      for (const match of context.matches) state = updateDispatch(state, match);
      return state;
    }
    const workflowToolDefinition = {
      kind: 'workflow-tool-call',
      target: 'workflow',
      match: (event) => {
        if (event.type === 'tool/call') return { id: String(event.data.callId), role: 'start' };
        if (event.type === 'tool/result') {
          return { id: String(event.data.message.source.callId), role: 'update' };
        }
        if (event.type === 'tool/code-dispatch-start' || event.type === 'tool/code-dispatch') {
          const rootCallId = event.data.rootCallId;
          return typeof rootCallId === 'string' && rootCallId !== ''
            ? { id: rootCallId, role: 'update' }
            : null;
        }
        return null;
      },
      start: (_context, match) => {
        const root = rootCall(match);
        return {
          rootId: root.callId,
          calls: new Map([[root.callId, root]]),
          children: new Map(),
          parents: new Map(),
        };
      },
      update: (context, match) => {
        if (match.event.type !== 'tool/result') return updateDispatch(context.state, match);
        const previous = context.state.calls.get(context.state.rootId);
        const running = previous !== undefined && !('kind' in previous) ? previous : undefined;
        const result = rootResult(match, running);
        if (result === undefined) return context.state;
        const calls = new Map(context.state.calls);
        calls.set(context.state.rootId, result);
        return { ...context.state, calls };
      },
      buildViewNode: (context) => {
        const state = context.state !== undefined ? context.state : fallbackState(context);
        if (state === undefined) return null;
        const root = projectCall(state, state.rootId, interruption(context));
        if (root === undefined) return null;
        const anchorSeq = context.start !== undefined
          ? context.start.event.seq
          : 'kind' in root
            ? root.seq
            : context.matches[0] !== undefined ? context.matches[0].event.seq ?? 0 : 0;
        return workflowNode(context, anchorSeq, { kind: 'tool', root });
      },
    };
    function registerWorkflowToolDefinition(ctx) {
      ctx.uiConversation.events.register(workflowToolDefinition);
    }
    
    // ---------------------------------------------------------------------------
    // Compaction requests and session boundaries.
    // ---------------------------------------------------------------------------
    
    function checkpointId(event) {
      if (event.type !== 'user/message') return undefined;
      const source = event.data.source;
      return source.kind === 'plugin' && source.plugin === 'compact'
        && typeof source.compactionId === 'string' && source.compactionId !== ''
        ? source.compactionId
        : undefined;
    }
    function eventCompactionId(event) {
      if (event.type !== 'compaction/start'
        && event.type !== 'compaction/summary'
        && event.type !== 'compaction/end') return undefined;
      const value = event.data.compactionId;
      return typeof value === 'string' && value !== '' ? value : undefined;
    }
    function requestFromState(state) {
      const start = state.start.event;
      if (start.type !== 'compaction/start') return undefined;
      const summary = state.summary !== undefined ? state.summary.event : undefined;
      const end = state.end !== undefined ? state.end.event : undefined;
      const checkpoint = state.checkpoint !== undefined ? state.checkpoint.event : undefined;
      return {
        purpose: 'compaction',
        startSeq: start.seq,
        turn: start.data.turn,
        step: 0,
        startedAt: start.time,
        completedAt: end !== undefined && end.type === 'compaction/end' ? end.time : null,
        status: end === undefined || end.type !== 'compaction/end'
          ? 'running'
          : end.data.error === undefined ? 'complete' : 'error',
        ...(end !== undefined && end.type === 'compaction/end' && end.data.error !== undefined
          ? { error: end.data.error }
          : {}),
        ...(summary === undefined || summary.type !== 'compaction/summary'
          ? {}
          : {
            resultSeq: summary.seq,
            summary: summary.data.summary,
            ...(summary.data.rawOutput === undefined ? {} : { rawOutput: summary.data.rawOutput }),
            provenance: { provider: summary.data.provider, model: summary.data.model },
            requestConfig: {
              provider: summary.data.provider,
              model: summary.data.model,
              purpose: 'compaction',
              ...(summary.data.maxTokens === undefined ? {} : { maxTokens: summary.data.maxTokens }),
            },
            ...(summary.data.usage === undefined ? {} : { usage: summary.data.usage }),
          }),
        ...(checkpoint !== undefined && checkpoint.type === 'user/message'
          ? { replacementSeq: checkpoint.seq }
          : {}),
      };
    }
    const workflowCompactionDefinition = {
      kind: 'workflow-compaction',
      target: 'workflow',
      match: (event) => {
        const compactId = eventCompactionId(event);
        if (compactId !== undefined) {
          return { id: compactId, role: event.type === 'compaction/start' ? 'start' : 'update' };
        }
        const checkpoint = checkpointId(event);
        return checkpoint === undefined ? null : { id: checkpoint, role: 'update' };
      },
      start: (_context, match) => {
        if (match.event.type !== 'compaction/start') {
          throw new Error('workflow-compaction start requires compaction/start');
        }
        return { start: match };
      },
      update: (context, match) => {
        if (match.event.type === 'compaction/summary') return { ...context.state, summary: match };
        if (match.event.type === 'compaction/end') return { ...context.state, end: match };
        return checkpointId(match.event) === undefined
          ? context.state
          : { ...context.state, checkpoint: match };
      },
      buildViewNode: (context) => {
        if (context.state === undefined) return null;
        const request = requestFromState(context.state);
        return request === undefined
          ? null
          : workflowNode(context, request.startSeq, { kind: 'compaction', request });
      },
    };
    const workflowSessionEndDefinition = {
      kind: 'workflow-session-end',
      target: 'workflow',
      match: (event) => event.type === 'session/end-seed'
        ? { id: String(event.seq), role: 'start' }
        : null,
      start: (_context, match) => ({ seq: match.event.seq, time: match.event.time }),
      update: (context) => context.state,
      buildViewNode: (context) => context.state === undefined
        ? null
        : workflowNode(context, context.state.seq, {
          kind: 'session-end',
          seq: context.state.seq,
          time: context.state.time,
        }),
    };
    function registerWorkflowCompactionDefinitions(ctx) {
      ctx.uiConversation.events.register(workflowCompactionDefinition);
      ctx.uiConversation.events.register(workflowSessionEndDefinition);
    }
    
    //#endregion
    //#region src/client/view.js
    /**
     * Visual user-turn and model-call explorer backed by the Workflow-owned
     * projection (plain-JS port; icons/JsonTree/Modal from dsh-client-ui-primitives).
     */
    
    // ---------------------------------------------------------------------------
    // Class-name map (plain CSS classes, no modules).
    // ---------------------------------------------------------------------------
    
    const css = {
      root: 'dshaw-root',
      summary: 'dshaw-summary',
      summaryTitle: 'dshaw-summaryTitle',
      metrics: 'dshaw-metrics',
      metric: 'dshaw-metric',
      workspace: 'dshaw-workspace',
      turns: 'dshaw-turns',
      turnList: 'dshaw-turnList',
      turnItem: 'dshaw-turnItem',
      turnItemSelected: 'dshaw-turnItemSelected',
      turnTopline: 'dshaw-turnTopline',
      turnBottomline: 'dshaw-turnBottomline',
      status: 'dshaw-status',
      statusComplete: 'dshaw-status_complete',
      statusError: 'dshaw-status_error',
      statusRunning: 'dshaw-status_running',
      statusWaiting: 'dshaw-status_waiting',
      loadOlder: 'dshaw-loadOlder',
      main: 'dshaw-main',
      turnHeader: 'dshaw-turnHeader',
      callScroller: 'dshaw-callScroller',
      virtualBody: 'dshaw-virtualBody',
      virtualRow: 'dshaw-virtualRow',
      callRow: 'dshaw-callRow',
      callHeader: 'dshaw-callHeader',
      tokenMetric: 'dshaw-tokenMetric',
      flow: 'dshaw-flow',
      flowCard: 'dshaw-flowCard',
      flowCardSelected: 'dshaw-flowCardSelected',
      requestCard: 'dshaw-requestCard',
      responseCard: 'dshaw-responseCard',
      toolCard: 'dshaw-toolCard',
      toolCardError: 'dshaw-toolCardError',
      cardHeader: 'dshaw-cardHeader',
      cardTitle: 'dshaw-cardTitle',
      cardBody: 'dshaw-cardBody',
      cardPreview: 'dshaw-cardPreview',
      chips: 'dshaw-chips',
      arrow: 'dshaw-arrow',
      toolFlow: 'dshaw-toolFlow',
      toolResult: 'dshaw-toolResult',
      toolResultRunning: 'dshaw-toolResultRunning',
      toolResultComplete: 'dshaw-toolResultComplete',
      toolResultError: 'dshaw-toolResultError',
      finalReply: 'dshaw-finalReply',
      detailPanel: 'dshaw-detailPanel',
      detailGrid: 'dshaw-detailGrid',
      detailCode: 'dshaw-detailCode',
      jsonInspector: 'dshaw-jsonInspector',
      jsonToolbar: 'dshaw-jsonToolbar',
      jsonLanguage: 'dshaw-jsonLanguage',
      jsonActions: 'dshaw-jsonActions',
      jsonAction: 'dshaw-jsonAction',
      jsonViewport: 'dshaw-jsonViewport',
      jsonTree: 'dshaw-jsonTree',
      jsonDialog: 'dshaw-jsonDialog',
      jsonDialogHeader: 'dshaw-jsonDialogHeader',
      jsonDialogBody: 'dshaw-jsonDialogBody',
      empty: 'dshaw-empty',
    };
    
    const TIME_FORMAT = new Intl.DateTimeFormat(undefined, {
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    
    function formatTime(value) {
      return value === null || !Number.isFinite(value) ? '—' : TIME_FORMAT.format(new Date(value));
    }
    
    function formatDuration(value) {
      if (value === null || !Number.isFinite(value)) return '—';
      if (value < 1000) return `${Math.round(value)}ms`;
      if (value < 60000) return `${(value / 1000).toFixed(value < 10000 ? 1 : 0)}s`;
      const minutes = Math.floor(value / 60000);
      const seconds = Math.round(value % 60000 / 1000);
      return `${minutes}m${seconds}s`;
    }
    
    function concise(value, fallback) {
      const text = value !== undefined ? value.replace(/\s+/g, ' ').trim() : '';
      return text === '' ? fallback : text;
    }
    
    function stringify(value) {
      if (typeof value === 'string') return value;
      try {
        return JSON.stringify(value, null, 2);
      } catch {
        return String(value);
      }
    }
    
    function statusLabel(status, t) {
      switch (status) {
        case 'waiting': return t('workflow.status.waiting');
        case 'running': return t('workflow.status.running');
        case 'complete': return t('workflow.status.complete');
        case 'error': return t('workflow.status.error');
      }
    }
    
    function StatusIcon({ status }) {
      if (status === 'complete') return jsx(IconCheckOutline16, { size: 14, 'aria-hidden': true });
      if (status === 'error') return jsx(IconWarningOutline16, { size: 14, 'aria-hidden': true });
      if (status === 'running') return jsx(IconLoadingOutline16, { size: 14, 'aria-hidden': true });
      return jsx(IconQueueOutline14, { size: 14, 'aria-hidden': true });
    }
    
    function Status({ status, t }) {
      return jsx('span', {
        className: [
          css.status,
          status === 'complete' ? css.statusComplete
            : status === 'error' ? css.statusError
              : status === 'running' ? css.statusRunning : css.statusWaiting,
        ].join(' '),
        children: [
          jsx(StatusIcon, { status }),
          statusLabel(status, t),
        ],
      });
    }
    
    function Metric({ value, label }) {
      return jsx('span', {
        className: css.metric,
        children: [
          jsx('strong', { children: value }),
          jsx('span', { children: label }),
        ],
      });
    }
    
    function turnTitle(turn, t) {
      return t('workflow.turnTitle', {
        turn: String(turn.turn),
        prompt: turn.promptPreview,
      });
    }
    
    function TurnItem({ turn, selected, onSelect, t }) {
      return jsx('button', {
        type: 'button',
        className: `${css.turnItem} ${selected ? css.turnItemSelected : ''}`,
        'aria-current': selected ? 'true' : undefined,
        onClick: onSelect,
        title: turn.prompt,
        children: [
          jsx('span', {
            className: css.turnTopline,
            children: [
              jsx('strong', { children: turnTitle(turn, t) }),
              jsx('time', { children: formatTime(turn.startedAt) }),
            ],
          }),
          jsx('span', {
            className: css.turnBottomline,
            children: [
              jsx('span', {
                children: `${turn.calls.length}${t('workflow.calls.suffix')} · ${turn.toolCount}${t('workflow.tools.suffix')}`,
              }),
              jsx(Status, { status: turn.status, t }),
            ],
          }),
        ],
      });
    }
    
    function detailKey(target) {
      return target.kind === 'tool' ? `${target.key}:tool:${target.tool}` : `${target.key}:${target.kind}`;
    }
    
    function FlowArrow() {
      return jsx(IconChevronRightOutline14, { className: css.arrow, size: 18, 'aria-hidden': true });
    }
    
    function CardButton({ className, target, selected, onSelect, children, label }) {
      return jsx('button', {
        type: 'button',
        className: `${css.flowCard} ${className ?? ''} ${selected ? css.flowCardSelected : ''}`,
        'aria-label': label,
        'aria-expanded': selected,
        onClick: () => { onSelect(target); },
        children,
      });
    }
    
    function RequestCard({ call, selected, onSelect, t }) {
      const request = call.request;
      const model = request !== undefined
        ? (request.requestConfig !== undefined && request.requestConfig.model !== undefined
          ? request.requestConfig.model
          : request.provenance !== undefined ? request.provenance.model : undefined)
        : undefined;
      const systemCount = request !== undefined
        && request.prompt !== undefined
        && request.prompt.system !== undefined
        && request.prompt.system.trim() !== '' ? 1 : 0;
      const messageCount = call.messages.length;
      const tools = request !== undefined && request.prompt !== undefined
        ? request.prompt.tools !== undefined ? request.prompt.tools.length : 0
        : 0;
      return jsx(CardButton, {
        className: css.requestCard,
        target: { kind: 'request', key: call.id },
        selected,
        onSelect,
        label: `${t('workflow.request')} ${call.number}`,
        children: [
          jsx('span', {
            className: css.cardHeader,
            children: jsx('span', {
              className: css.cardTitle,
              children: [
                jsx(IconSendOutline16, { size: 14, 'aria-hidden': true }),
                t('workflow.request'),
              ],
            }),
          }),
          jsx('span', {
            className: css.cardBody,
            children: [
              jsx('span', { className: css.cardPreview, children: model ?? t('workflow.request.context') }),
              jsx('span', {
                className: css.chips,
                children: [
                  jsx('span', { children: `${t('workflow.system')} ${systemCount}` }),
                  jsx('span', { children: `${t('workflow.messages')} ${messageCount}` }),
                  jsx('span', { children: `${t('workflow.toolDefinitions')} ${tools}` }),
                ],
              }),
            ],
          }),
        ],
      });
    }
    
    function ResponseCard({ call, selected, onSelect, t }) {
      const response = call.response;
      const toolCalls = response !== undefined
        && response.sourceBlocks !== undefined
        ? response.sourceBlocks.filter(block => block.type === 'tool-call').length
        : call.tools.length;
      return jsx(CardButton, {
        className: css.responseCard,
        target: { kind: 'response', key: call.id },
        selected,
        onSelect,
        label: `${t('workflow.response')} ${call.number}`,
        children: [
          jsx('span', {
            className: css.cardHeader,
            children: jsx('span', {
              className: css.cardTitle,
              children: [
                jsx(IconSparkle16, { size: 14, 'aria-hidden': true }),
                t('workflow.response'),
              ],
            }),
          }),
          jsx('span', {
            className: css.cardBody,
            children: [
              jsx('span', {
                className: css.cardPreview,
                children: response === undefined
                  ? t('workflow.response.pending')
                  : concise(response.previewMarkdown ?? response.text, t('workflow.response.toolOnly')),
              }),
              jsx('span', {
                className: css.chips,
                children: [
                  jsx('span', {
                    children: `${t('workflow.reasoning')} ${response !== undefined && response.thinkingDetail !== undefined ? 1 : 0}`,
                  }),
                  jsx('span', {
                    children: `${t('workflow.content')} ${response !== undefined && response.outputDetail !== undefined ? 1 : 0}`,
                  }),
                  jsx('span', { children: `${t('workflow.toolCalls')} ${toolCalls}` }),
                ],
              }),
            ],
          }),
        ],
      });
    }
    
    /**
     * Render the accessible status strip for one tool result.
     * @param props - Resolved status, visible label, and formatted duration.
     * @returns The live tool-result status strip.
     */
    function WorkflowToolResult({ status, label, duration }) {
      const resultClass = status === 'error'
        ? css.toolResultError
        : status === 'complete' ? css.toolResultComplete : css.toolResultRunning;
      return jsx('span', {
        className: `${css.toolResult} ${resultClass}`,
        'data-tool-status': status,
        'aria-live': 'polite',
        children: [
          status === 'error'
            ? jsx(IconWarningOutline16, { size: 14, 'aria-hidden': true })
            : status === 'complete'
              ? jsx(IconCheckOutline16, { size: 14, 'aria-hidden': true })
              : jsx(IconLoadingOutline16, { size: 14, 'aria-hidden': true }),
          jsx('span', { children: label }),
          jsx('time', { children: duration }),
        ],
      });
    }
    
    function ToolCard({ call, tool, index, selected, onSelect, t }) {
      const settled = tool.outputDetail !== undefined
        || tool.result !== undefined
        || tool.resultPreviewMarkdown !== undefined;
      const status = tool.isError === true ? 'error' : settled ? 'complete' : 'running';
      const resultLabel = status === 'error'
        ? t('workflow.status.error')
        : status === 'complete'
          ? concise(tool.resultPreviewMarkdown ?? tool.result, t('workflow.tool.complete'))
          : t('workflow.status.running');
      return jsx(CardButton, {
        className: tool.isError === true ? css.toolCardError : css.toolCard,
        target: { kind: 'tool', key: call.id, tool: index },
        selected,
        onSelect,
        label: `${t('workflow.tool')} ${tool.text || tool.callId || index + 1}`,
        children: [
          jsx('span', {
            className: css.cardHeader,
            children: jsx('span', {
              className: css.cardTitle,
              children: [
                jsx(IconCodeOutline16, { size: 14, 'aria-hidden': true }),
                tool.text || t('workflow.tool'),
              ],
            }),
          }),
          jsx('span', {
            className: css.cardBody,
            children: [
              jsx('span', {
                className: css.cardPreview,
                children: concise(tool.previewMarkdown, tool.callId ?? t('workflow.tool.call')),
              }),
              jsx(WorkflowToolResult, {
                status,
                label: resultLabel,
                duration: formatDuration(tool.timeSeconds === null ? null : tool.timeSeconds * 1000),
              }),
            ],
          }),
        ],
      });
    }
    
    // ---------------------------------------------------------------------------
    // JSON inspector (primitives JsonTree + Modal instead of react-json-view-lite).
    // ---------------------------------------------------------------------------
    
    function WorkflowJsonInspector({ data, label, t }) {
      const [dialogOpen, setDialogOpen] = useState(false);
      const expandButton = useRef(null);
      const dialogTitle = t('workflow.json.dialog', { label });
      const closeDialog = () => {
        setDialogOpen(false);
        window.setTimeout(() => { if (expandButton.current !== null) expandButton.current.focus(); }, 0);
      };
      const tree = (className) => jsx(JsonTree, {
        data,
        label: dialogTitle,
        className: `${css.jsonTree} ${className ?? ''}`.trim(),
        copyable: true,
        expandTopLevel: false,
      });
      return jsxs(Fragment, {
        children: [
          jsx('div', {
            className: css.jsonInspector,
            'data-workflow-scroll-region': '',
            children: [
              jsx('div', {
                className: css.jsonToolbar,
                children: [
                  jsx('span', {
                    className: css.jsonLanguage,
                    children: [
                      jsx(IconDataOutline16, { size: 13, 'aria-hidden': true }),
                      'JSON',
                    ],
                  }),
                  jsx('div', {
                    className: css.jsonActions,
                    children: jsx('button', {
                      ref: expandButton,
                      type: 'button',
                      className: css.jsonAction,
                      onClick: () => { setDialogOpen(true); },
                      'aria-label': t('workflow.json.expand'),
                      title: t('workflow.json.expand'),
                      children: jsx(IconFullscreenOutline16, { size: 14, 'aria-hidden': true }),
                    }),
                  }),
                ],
              }),
              jsx('div', { className: css.jsonViewport, children: tree('') }),
            ],
          }),
          jsx(Modal, {
            open: dialogOpen,
            onClose: closeDialog,
            title: dialogTitle,
            closeLabel: t('workflow.json.close'),
            className: css.jsonDialog,
            headless: true,
            children: [
              jsx('header', {
                className: css.jsonDialogHeader,
                children: [
                  jsx('strong', {
                    children: [
                      jsx(IconDataOutline16, { size: 16, 'aria-hidden': true }),
                      dialogTitle,
                    ],
                  }),
                  jsx('div', {
                    className: css.jsonActions,
                    children: jsx('button', {
                      type: 'button',
                      className: css.jsonAction,
                      onClick: closeDialog,
                      'aria-label': t('workflow.json.close'),
                      title: t('workflow.json.close'),
                      autoFocus: true,
                      children: jsx(IconCloseOutline16, { size: 16, 'aria-hidden': true }),
                    }),
                  }),
                ],
              }),
              jsx('div', {
                className: css.jsonDialogBody,
                'data-workflow-scroll-region': '',
                children: tree(''),
              }),
            ],
          }),
        ],
      });
    }
    
    // ---------------------------------------------------------------------------
    // Details panel.
    // ---------------------------------------------------------------------------
    
    function jsonSection(label, value) {
      return { label, value: stringify(value), json: true };
    }
    
    function treeSection(label, field, value) {
      const tree = { [field]: value };
      return { label, value: stringify(tree), tree };
    }
    
    function textSection(label, value) {
      const source = value.trim();
      if (!source.startsWith('{') && !source.startsWith('[')) return { label, value };
      try {
        return { label, value: stringify(JSON.parse(source)), json: true };
      } catch {
        return { label, value };
      }
    }
    
    function DetailPanel({ call, target, onClose, t }) {
      let title = t('workflow.request.details');
      let sections = [];
      if (target.kind === 'request') {
        const request = call.request;
        sections = [
          treeSection(t('workflow.systemPrompt'), 'system', request !== undefined && request.prompt !== undefined
            ? request.prompt.system ?? null
            : null),
          treeSection(t('workflow.messages'), 'messages', call.messages),
          treeSection(t('workflow.toolDefinitions'), 'tools', request !== undefined && request.prompt !== undefined
            ? request.prompt.tools ?? []
            : []),
        ];
      } else if (target.kind === 'response') {
        title = t('workflow.response.details');
        const response = call.response;
        sections = [
          textSection(t('workflow.reasoning'), (response !== undefined && response.thinkingDetail !== undefined
            ? response.thinkingDetail
            : t('workflow.empty'))),
          textSection(t('workflow.content'), response !== undefined
            ? response.outputDetail !== undefined ? response.outputDetail : response.text ?? t('workflow.empty')
            : t('workflow.empty')),
          jsonSection(t('workflow.metadata'), response !== undefined && response.assistantMetrics !== undefined
            ? response.assistantMetrics
            : {}),
        ];
      } else {
        title = t('workflow.tool.details');
        const tool = call.tools[target.tool];
        sections = [
          textSection(t('workflow.arguments'), tool !== undefined
            ? tool.inputDetail !== undefined ? tool.inputDetail : tool.previewMarkdown ?? t('workflow.empty')
            : t('workflow.empty')),
          textSection(t('workflow.result'), tool !== undefined
            ? tool.outputDetail !== undefined
              ? tool.outputDetail
              : tool.resultPreviewMarkdown !== undefined ? tool.resultPreviewMarkdown : tool.result ?? t('workflow.empty')
            : t('workflow.empty')),
          textSection(t('workflow.schema'), tool !== undefined
            ? tool.schemaDetail !== undefined ? tool.schemaDetail : t('workflow.empty')
            : t('workflow.empty')),
        ];
      }
      return jsx('section', {
        className: css.detailPanel,
        'aria-label': title,
        children: [
          jsx('header', {
            children: [
              jsx('strong', { children: title }),
              jsx('button', {
                type: 'button',
                onClick: onClose,
                'aria-label': t('workflow.details.close'),
                children: jsx(IconChevronUpOutline14, { size: 16, 'aria-hidden': true }),
              }),
            ],
          }),
          jsx('div', {
            className: css.detailGrid,
            children: sections.map(section => jsx('section', {
              key: section.label,
              children: [
                jsx('h4', { children: section.label }),
                section.tree !== undefined
                  ? jsx(WorkflowJsonInspector, { data: section.tree, label: section.label, t })
                  : section.json === true
                    ? jsx('div', {
                      'data-workflow-scroll-region': '',
                      children: jsx(CodeBlock, {
                        className: css.detailCode,
                        code: section.value,
                        lang: 'json',
                        copyLabel: t('workflow.copy'),
                        copiedLabel: t('workflow.copied'),
                      }),
                    })
                    : jsx('pre', { 'data-workflow-scroll-region': '', children: section.value }),
              ],
            })),
          }),
        ],
      });
    }
    
    // ---------------------------------------------------------------------------
    // Simple dependency-free virtualizer.
    // ---------------------------------------------------------------------------
    
    function useSimpleVirtualizer({ count, getScrollElement, estimateSize, overscan }) {
      const [state, setState] = useState({ scrollTop: 0, viewport: 0, tick: 0 });
      const sizes = useRef(new Map());
      useEffect(() => {
        const el = getScrollElement();
        if (el === null || el === undefined) return undefined;
        const update = () => setState((prev) => ({ ...prev, scrollTop: el.scrollTop, viewport: el.clientHeight }));
        update();
        el.addEventListener('scroll', update, { passive: true });
        const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
        if (observer !== null) observer.observe(el);
        return () => {
          el.removeEventListener('scroll', update);
          if (observer !== null) observer.disconnect();
        };
      }, [getScrollElement]);
      const { scrollTop, viewport } = state;
      const metrics = useMemo(() => {
        const offsets = [0];
        let total = 0;
        for (let index = 0; index < count; index++) {
          total += sizes.current.get(index) ?? estimateSize;
          offsets.push(total);
        }
        return { offsets, total };
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [count, estimateSize, state.tick]);
      function findIndexForOffset(value, offsets) {
        let low = 0;
        let high = offsets.length - 1;
        while (low < high) {
          const mid = (low + high) >> 1;
          if (offsets[mid] <= value) low = mid + 1;
          else high = mid;
        }
        return Math.max(0, low - 1);
      }
      const start = Math.max(0, findIndexForOffset(scrollTop, metrics.offsets) - overscan);
      const end = Math.min(count, findIndexForOffset(scrollTop + viewport, metrics.offsets) + 1 + overscan);
      const items = [];
      for (let index = start; index < end; index++) items.push(index);
      const measure = (index) => (el) => {
        if (el === null) return;
        const height = el.offsetHeight;
        if (height > 0 && sizes.current.get(index) !== height) {
          sizes.current.set(index, height);
          setState((prev) => ({ ...prev, tick: prev.tick + 1 }));
        }
      };
      return { items, offsets: metrics.offsets, total: metrics.total, measure };
    }
    
    function CallRow({ call, detail, onDetail, t }) {
      const selectedKey = detail === null ? null : detailKey(detail);
      const select = (target) => {
        onDetail(detailKey(target) === selectedKey ? null : target);
      };
      return jsx('article', {
        className: css.callRow,
        children: [
          jsx('header', {
            className: css.callHeader,
            children: [
              jsx('strong', { children: `${t('workflow.modelCall')} #${call.number}` }),
              jsx('span', { children: formatTime(call.startedAt) }),
              jsx('span', { children: formatDuration(call.durationMs) }),
              call.usage !== undefined && call.usage.inputTotal !== undefined
                ? jsx('span', {
                  className: css.tokenMetric,
                  children: [
                    jsx('span', { children: `${t('workflow.input')} ${call.usage.inputTotal.toLocaleString()}` }),
                    call.usage.inputUncached !== undefined
                      && (call.usage.cacheRead !== undefined || call.usage.cacheWrite !== undefined)
                      ? jsx('small', {
                        children: `${t('workflow.inputUncached')} ${call.usage.inputUncached.toLocaleString()}`,
                      })
                      : null,
                    call.usage.cacheRead !== undefined
                      ? jsx('small', {
                        children: `${t('workflow.cacheRead')} ${call.usage.cacheRead.toLocaleString()}`,
                      })
                      : null,
                    call.usage.cacheWrite !== undefined
                      ? jsx('small', {
                        children: `${t('workflow.cacheWrite')} ${call.usage.cacheWrite.toLocaleString()}`,
                      })
                      : null,
                  ],
                })
                : null,
              call.usage !== undefined && call.usage.output !== undefined
                ? jsx('span', { children: `${t('workflow.output')} ${call.usage.output.toLocaleString()}` })
                : null,
              jsx(Status, { status: call.status, t }),
            ],
          }),
          jsx('div', {
            className: css.flow,
            children: [
              jsx(RequestCard, { call, selected: selectedKey === `${call.id}:request`, onSelect: select, t }),
              jsx(FlowArrow, {}),
              jsx(ResponseCard, { call, selected: selectedKey === `${call.id}:response`, onSelect: select, t }),
              call.tools.map((tool, index) => jsx('span', {
                className: css.toolFlow,
                key: tool.callId ?? `${call.id}:${index}`,
                children: [
                  jsx(FlowArrow, {}),
                  jsx(ToolCard, {
                    call,
                    tool,
                    index,
                    selected: selectedKey === `${call.id}:tool:${index}`,
                    onSelect: select,
                    t,
                  }),
                ],
              })),
              call.tools.length === 0 && call.response !== undefined
                ? jsx('span', {
                  className: css.finalReply,
                  children: [
                    jsx(IconChevronRightOutline14, { size: 18, 'aria-hidden': true }),
                    jsx('span', {
                      children: [
                        jsx(IconSendOutline16, { size: 16, 'aria-hidden': true }),
                        t('workflow.finalReply'),
                      ],
                    }),
                  ],
                })
                : null,
            ],
          }),
          detail !== null
            ? jsx(DetailPanel, { call, target: detail, onClose: () => { onDetail(null); }, t })
            : null,
        ],
      });
    }
    
    /** Full-height Workflow conversation view. */
    function WorkflowView({ useSession, useWorkflow, loadOlder, viewRequest, completeViewRequest, t }) {
      const inspection = useWorkflow((snapshot) => snapshot);
      const hasOlder = useSession((snapshot) => snapshot.hasMore);
      const loadingOlder = useSession((snapshot) => snapshot.loadingOlder);
      const layout = useMemo(() => deriveWorkflowLayout({
        nodes: inspection.eventNodes,
        eventLocations: inspection.eventLocations,
        partial: inspection.partial,
        runningCalls: inspection.runningCalls,
        requests: inspection.requests,
        callSchemas: inspection.callSchemas,
      }), [inspection]);
      const model = useMemo(
        () => deriveWorkflowModel(layout, inspection.requests, new Map()),
        [inspection.requests, layout],
      );
      const [historyPage, setHistoryPage] = useState(0);
      const historyLoadPending = useRef(false);
      useEffect(() => {
        if (!hasOlder || loadingOlder || historyLoadPending.current) return;
        let active = true;
        historyLoadPending.current = true;
        void loadOlder().then((changed) => {
          historyLoadPending.current = false;
          if (active && changed) setHistoryPage((page) => page + 1);
        }, () => {
          historyLoadPending.current = false;
        });
        return () => { active = false; };
      }, [hasOlder, historyPage, loadOlder, loadingOlder]);
      useEffect(() => {
        if (viewRequest !== undefined && viewRequest !== null && viewRequest.view === 'workflow') {
          if (completeViewRequest !== undefined) completeViewRequest();
        }
      }, [viewRequest, completeViewRequest]);
      const [chosenTurn, setChosenTurn] = useState(null);
      const selectedTurn = model.turns.find(turn => turn.turn === chosenTurn) ?? model.turns.at(-1);
      const [detail, setDetail] = useState(null);
      const scrollRef = useRef(null);
      const calls = selectedTurn !== undefined ? selectedTurn.calls : [];
      const getScrollElement = useCallback(() => scrollRef.current, []);
      const virtualizer = useSimpleVirtualizer({
        count: calls.length,
        getScrollElement,
        estimateSize: 230,
        overscan: 4,
      });
      const handleCallWheel = useCallback((event) => {
        if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
        if (event.target instanceof Element
          && event.target.closest('[data-workflow-scroll-region]') !== null) return;
        const scroller = event.currentTarget;
        const scale = event.deltaMode === 1
          ? 16
          : event.deltaMode === 2 ? scroller.clientHeight : 1;
        const next = Math.max(0, Math.min(
          scroller.scrollHeight - scroller.clientHeight,
          scroller.scrollTop + event.deltaY * scale,
        ));
        if (next === scroller.scrollTop) return;
        scroller.scrollTop = next;
        event.preventDefault();
      }, []);
    
      return jsx('section', {
        className: css.root,
        'data-conversation-composer-overlay': '',
        'aria-label': t('workflow.aria'),
        children: [
          jsx('header', {
            className: css.summary,
            children: [
              jsx('div', {
                className: css.summaryTitle,
                children: [
                  jsx(IconBranchOutline16, { size: 18, 'aria-hidden': true }),
                  jsx('strong', { children: t('view.workflow') }),
                ],
              }),
              jsx('div', {
                className: css.metrics,
                children: [
                  jsx(Metric, { value: String(model.turns.length), label: t('workflow.turns') }),
                  jsx(Metric, { value: String(model.requestCount), label: t('workflow.modelCalls') }),
                  jsx(Metric, { value: String(model.toolCount), label: t('workflow.toolCalls') }),
                  jsx(Metric, { value: formatDuration(model.durationMs), label: t('workflow.totalDuration') }),
                ],
              }),
            ],
          }),
          jsx('div', {
            className: css.workspace,
            children: [
              jsx('aside', {
                className: css.turns,
                'aria-label': t('workflow.turns'),
                children: [
                  jsx('header', {
                    children: [
                      jsx('strong', { children: t('workflow.turns') }),
                      jsx('span', { children: String(model.turns.length) }),
                    ],
                  }),
                  jsx('div', {
                    className: css.turnList,
                    children: model.turns.map(turn => jsx(TurnItem, {
                      key: turn.turn,
                      turn,
                      selected: turn.turn === (selectedTurn !== undefined ? selectedTurn.turn : null),
                      onSelect: () => { setChosenTurn(turn.turn); setDetail(null); },
                      t,
                    })),
                  }),
                  hasOlder
                    ? jsx('button', {
                      type: 'button',
                      className: css.loadOlder,
                      disabled: loadingOlder,
                      onClick: () => { void loadOlder(); },
                      children: [
                        loadingOlder
                          ? jsx(IconLoadingOutline16, { size: 14, 'aria-hidden': true })
                          : jsx(IconChevronDownOutline14, { size: 14, 'aria-hidden': true }),
                        loadingOlder ? t('workflow.loadingOlder') : t('workflow.loadOlder'),
                      ],
                    })
                    : null,
                ],
              }),
              jsx('main', {
                className: css.main,
                children: selectedTurn === undefined
                  ? jsx('div', { className: css.empty, children: t('workflow.emptyTurns') })
                  : [
                    jsx('header', {
                      className: css.turnHeader,
                      children: [
                        jsx('div', {
                          children: jsx('strong', { title: selectedTurn.prompt, children: turnTitle(selectedTurn, t) }),
                        }),
                        jsx('div', {
                          children: [
                            jsx('span', { children: formatTime(selectedTurn.startedAt) }),
                            jsx('span', { children: formatDuration(selectedTurn.durationMs) }),
                            jsx('span', { children: `${selectedTurn.calls.length}${t('workflow.calls.suffix')}` }),
                            jsx('span', { children: `${selectedTurn.toolCount}${t('workflow.tools.suffix')}` }),
                          ],
                        }),
                      ],
                    }),
                    jsx('div', {
                      ref: scrollRef,
                      className: css.callScroller,
                      onWheelCapture: handleCallWheel,
                      children: calls.length === 0
                        ? jsx('div', { className: css.empty, children: t('workflow.emptyCalls') })
                        : jsx('div', {
                          className: css.virtualBody,
                          style: { height: virtualizer.total },
                          children: virtualizer.items.map((item) => {
                            const call = calls[item];
                            if (call === undefined) return null;
                            const activeDetail = detail !== null && detail.key === call.id ? detail : null;
                            return jsx('div', {
                              key: call.id,
                              ref: virtualizer.measure(item),
                              'data-index': item,
                              className: css.virtualRow,
                              style: { transform: `translateY(${virtualizer.offsets[item]}px)` },
                              children: jsx(CallRow, { call, detail: activeDetail, onDetail: setDetail, t }),
                            });
                          }),
                        }),
                    }),
                  ],
              }),
            ],
          }),
        ],
      });
    }
    
    //#endregion
    //#region src/client/index.js
    /**
     * Browser plugin registering the visual Workflow conversation view.
     * Adapted to dsh 0.1.2-alpha.1: the uiConversation projection registries,
     * the uiSession hook provider, and the conversation.view slot contract.
     */
    
    /** Required services: view slots, Workflow projection registries, Session paging, hooks, and localization. */
    const inject = ['slots', 'sessions', 'uiSession', 'uiConversation', 'locale'];
    
    /** Register the independently installable Workflow view tab. */
    function apply(ctx) {
      const workflowSources = new WeakMap();
      const workflowSource = (binding) => {
        let source = workflowSources.get(binding);
        if (source === undefined) {
          const target = ctx.uiConversation.binding(binding).target('workflow');
          source = {
            getSnapshot: () => target.getSnapshot() ?? EMPTY_WORKFLOW_SNAPSHOT,
            subscribe: (listener) => target.subscribe(listener),
          };
          workflowSources.set(binding, source);
        }
        return source;
      };
    
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-workflow: dictionaries');
      const t = ctx.locale.bind(NS);
      registerWorkflowMessageDefinitions(ctx);
      registerWorkflowRequestHeaderDefinition(ctx);
      registerWorkflowSurfaceDefinition(ctx);
      registerWorkflowAssistantDefinition(ctx);
      registerWorkflowToolDefinition(ctx);
      registerWorkflowCompactionDefinitions(ctx);
      registerWorkflowConversationView(ctx);
    
      ctx.uiSession.provide({
        hooks: ['workflow'],
        resolve: (binding) => ({ hooks: { workflow: workflowSource(binding) } }),
      });
    
      ctx.slots.inject('conversation.view', () => ctx.slots.register({
        name: 'conversation.view',
        id: 'workflow',
        order: 15,
        locale: NS,
        label: () => t('view.workflow'),
        inject: (sessionId) => {
          const session = ctx.sessions.binding(sessionId)?.session;
          if (session === undefined) {
            throw new Error(`ui-workflow: session "${sessionId}" is unavailable`);
          }
          const workflow = ctx.uiConversation.binding(sessionId).target('workflow');
          return {
            loadOlder: async () => {
              // 0.1.2 session paging returns void; detect real view growth by
              // comparing the Workflow view snapshot before and after.
              const before = workflow.getSnapshot();
              await session.loadOlder();
              return workflow.getSnapshot() !== before;
            },
          };
        },
      }, WorkflowView));
    }
    
    //#endregion

    // The client loader reads the plugin descriptor off module.exports:
    // without apply/inject the entry cannot activate and web boot fails.
    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  }
});

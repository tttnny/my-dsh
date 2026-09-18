import React, { useEffect, useMemo, useRef, useState } from 'react';
import { store } from '../store.js';
import { validateReasoningEfforts } from '../../types.js';
import type { CatalogModelEntry } from '../../types.js';

/**
 * 模型目录页（「可用模型」右侧 tab）：
 * - 「从 A6API 获取市场模型」：翻页拉取 A6API 市场全部模型 ID 入目录（参数初始为空）
 * - 「从 OpenRouter 一键查询」：对全部模型查 OpenRouter 并填充参数（name 仅用户手动填写）；
 *   每行也可单独查询
 * - 筛选：可用模型（当前令牌白名单，与「可用模型」页同源）/ 参数状态（已填/未填）
 * - 行内编辑 settings.yaml 原生模型字段；保存后若该模型已在 DSH 启用，
 *   服务端立即重写 settings.yaml 对应条目（参数即时生效）
 */
export const ModelCatalogPanel: React.FC = () => {
  const [catalog, setCatalog] = useState<CatalogModelEntry[]>(store.getState().catalog);
  const [models, setModels] = useState(store.getState().models);
  const [busy, setBusy] = useState<null | 'fetch' | 'query'>(store.getState().catalogBusy);
  const [search, setSearch] = useState('');
  const [availFilter, setAvailFilter] = useState<'all' | 'available' | 'unavailable'>('all');
  const [paramFilter, setParamFilter] = useState<'all' | 'filled' | 'empty'>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [queryingId, setQueryingId] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const confirmClearTimer = useRef<any>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [draft, setDraft] = useState<{
    name: string;
    contextWindow: string;
    maxTokens: string;
    inputText: boolean;
    inputImage: boolean;
    reasoningText: string;
    reasoningFalse: boolean;
  }>({ name: '', contextWindow: '', maxTokens: '', inputText: false, inputImage: false, reasoningText: '', reasoningFalse: false });

  useEffect(() => {
    const unsub = store.subscribe(() => {
      const s = store.getState();
      setCatalog(s.catalog);
      setModels(s.models);
      setBusy(s.catalogBusy);
    });
    store.fetchCatalog();
    return unsub;
  }, []);

  // 当前令牌白名单（与「可用模型」页同源）；目录「可用」筛选基于它
  const availableSet = useMemo(
    () => new Set(models.map((m) => m.model_name.toLowerCase())),
    [models],
  );

  const flash = (kind: 'ok' | 'err', text: string) => {
    setMsg({ kind, text });
    setTimeout(() => setMsg(null), 5000);
  };

  const handleFetchMarket = async () => {
    const r = await store.fetchMarketModels();
    if (r.ok) {
      if (r.failedPages && r.failedPages > 0) {
        flash('err', `已获取 ${r.total} 个模型（新增 ${r.added} 个），但有 ${r.failedPages} 页拉取失败，目录可能不完整，请重试`);
      } else {
        flash('ok', `已获取 ${r.total} 个模型（新增 ${r.added} 个）`);
      }
    } else flash('err', r.error || '获取失败');
  };

  const handleQueryAll = async () => {
    const r = await store.queryOpenRouter();
    if (r.ok) {
      const nf = r.notFound?.length || 0;
      flash('ok', `已更新 ${r.updated} 个模型参数${nf > 0 ? `，${nf} 个未在 OpenRouter 查到（参数留空可手动填写）` : ''}`);
    } else flash('err', r.error || '查询失败');
  };

  const handleQueryOne = async (id: string) => {
    setQueryingId(id);
    const r = await store.queryOpenRouter([id]);
    setQueryingId(null);
    if (r.ok) {
      if ((r.updated || 0) > 0) flash('ok', `「${id}」已从 OpenRouter 填充参数`);
      else flash('ok', `「${id}」在 OpenRouter 未查到，可手动填写参数`);
    } else flash('err', r.error || '查询失败');
  };

  /** 清空目录：首次点击进入确认态（3s 自动恢复），再次点击执行 */
  const handleClear = async () => {
    if (!confirmClear) {
      setConfirmClear(true);
      if (confirmClearTimer.current) clearTimeout(confirmClearTimer.current);
      confirmClearTimer.current = setTimeout(() => setConfirmClear(false), 3000);
      return;
    }
    if (confirmClearTimer.current) clearTimeout(confirmClearTimer.current);
    setConfirmClear(false);
    setEditingId(null);
    const r = await store.clearCatalog();
    if (r.ok) flash('ok', '模型目录已清空，可重新「从 A6API 获取市场模型」');
    else flash('err', r.error || '清空失败');
  };

  const startEdit = (entry: CatalogModelEntry) => {
    const re = entry.reasoningEfforts && typeof entry.reasoningEfforts === 'object' ? entry.reasoningEfforts : {};
    setDraft({
      name: entry.name || '',
      contextWindow: entry.contextWindow != null ? String(entry.contextWindow) : '',
      maxTokens: entry.maxTokens != null ? String(entry.maxTokens) : '',
      inputText: entry.input ? entry.input.includes('text') : false,
      inputImage: entry.input ? entry.input.includes('image') : false,
      // 保留 off 等 null 值项（显示为 "off: "），避免编辑保存后档位静默丢失
      reasoningText: Object.entries(re)
        .map(([k, v]) => `${k}: ${v === null ? '' : v}`)
        .join(', '),
      reasoningFalse: entry.reasoningEfforts === false,
    });
    setEditingId(entry.id);
  };

  const handleSave = async (id: string) => {
    const patch: Partial<CatalogModelEntry> = {};
    const name = draft.name.trim();
    // name 仅用户手动填写：空串 = 清空（发送 null 删除已有 name）
    patch.name = name || (null as any);
    const ctx = Number(draft.contextWindow);
    if (draft.contextWindow.trim() !== '') {
      if (!Number.isInteger(ctx) || ctx < 1) {
        flash('err', 'contextWindow 必须是正整数');
        return;
      }
      patch.contextWindow = ctx;
    } else {
      patch.contextWindow = null as any; // 清空 = 删除字段
    }
    const maxT = Number(draft.maxTokens);
    if (draft.maxTokens.trim() !== '') {
      if (!Number.isInteger(maxT) || maxT < 1) {
        flash('err', 'maxTokens 必须是正整数');
        return;
      }
      patch.maxTokens = maxT;
    } else {
      patch.maxTokens = null as any;
    }
    const mods: ('text' | 'image')[] = [];
    if (draft.inputText) mods.push('text');
    if (draft.inputImage) mods.push('image');
    patch.input = mods.length > 0 ? mods : null as any;

    if (draft.reasoningFalse) {
      patch.reasoningEfforts = false;
    } else {
      const text = draft.reasoningText.trim();
      if (text) {
        const parsed: Record<string, string | null> = {};
        let bad = false;
        for (const seg of text.split(',')) {
          const idx = seg.indexOf(':');
          if (idx < 0) {
            bad = true;
            break;
          }
          const k = seg.slice(0, idx).trim();
          const v = seg.slice(idx + 1).trim();
          if (!k) {
            bad = true;
            break;
          }
          parsed[k] = v || null;
        }
        if (bad) {
          flash('err', 'reasoningEfforts 格式应为 "low: low, medium: medium"');
          return;
        }
        // DSH 语义预检（与服务端一致）：键 ∈ 档位、值非空（仅 off 可 null）、至少一个非 off 档位
        const checked = validateReasoningEfforts(parsed);
        if (!checked.ok) {
          flash('err', checked.error);
          return;
        }
        patch.reasoningEfforts = checked.value;
      } else {
        patch.reasoningEfforts = null as any; // 删除
      }
    }

    const r = await store.updateCatalogEntry(id, patch);
    if (r.ok) {
      setEditingId(null);
      flash('ok', `「${id}」已保存${store.getState().dshConfiguredModels.some((m) => m.toLowerCase() === id.toLowerCase()) ? '，并已同步到 DSH 配置' : ''}`);
    } else {
      flash('err', r.error || '保存失败');
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return catalog
      .filter((e) => {
        if (q && !e.id.toLowerCase().includes(q) && !(e.name || '').toLowerCase().includes(q)) return false;
        const isAvail = availableSet.has(e.id.toLowerCase());
        if (availFilter === 'available' && !isAvail) return false;
        if (availFilter === 'unavailable' && isAvail) return false;
        const filled = e.contextWindow != null || e.maxTokens != null || (e.input && e.input.length > 0);
        if (paramFilter === 'filled' && !filled) return false;
        if (paramFilter === 'empty' && filled) return false;
        return true;
      })
      .sort((a, b) => a.id.localeCompare(b.id));
  }, [catalog, search, availFilter, paramFilter, availableSet]);

  const filledCount = catalog.filter((e) => e.contextWindow != null || e.maxTokens != null || (e.input && e.input.length > 0)).length;
  const availCount = catalog.filter((e) => availableSet.has(e.id.toLowerCase())).length;

  return (
    <div className="dsh-a6-catalog-page">
      {/* 头部工具栏 */}
      <div className="dsh-a6-section-header">
        <div className="dsh-a6-catalog-toolbar">
          <button
            type="button"
            className="dsh-a6-btn dsh-a6-btn-primary dsh-a6-btn-sm"
            onClick={handleFetchMarket}
            disabled={busy !== null}
            data-tooltip="从 A6API 市场翻页拉取全部支持模型的 ID（含品牌），参数初始为空，随后可用 OpenRouter 查询填充"
            data-tooltip-pos="down"
          >
            {busy === 'fetch' ? '获取中...' : '从 A6API 获取市场模型'}
          </button>
          <button
            type="button"
            className="dsh-a6-btn dsh-a6-btn-secondary dsh-a6-btn-sm"
            onClick={handleQueryAll}
            disabled={busy !== null || catalog.length === 0}
            data-tooltip="对目录中全部模型查询 OpenRouter 并填充 contextWindow / maxTokens / input；查不到的保持留空可手动填写"
            data-tooltip-pos="down"
          >
            {busy === 'query' ? '查询中...' : '从 OpenRouter 一键查询'}
          </button>
          <button
            type="button"
            className={`dsh-a6-btn dsh-a6-btn-danger dsh-a6-btn-sm${confirmClear ? ' dsh-a6-btn-clear-confirm' : ''}`}
            onClick={handleClear}
            disabled={busy !== null || catalog.length === 0}
            data-tooltip="清空模型目录全部条目，可重新从 A6API 获取并重新用 OpenRouter 填充（不影响已写入 DSH 配置的模型）"
            data-tooltip-pos="down"
          >
            {confirmClear ? '确认清空？' : '清空目录'}
          </button>
          <div className="dsh-a6-catalog-count">
            共 {catalog.length} 个 · 可用 {availCount} 个 · 已填参数 {filledCount} 个
          </div>
        </div>

        {/* 筛选区 */}
        <div className="dsh-a6-catalog-filters">
          <div className="dsh-a6-filter-group">
            <button
              type="button"
              className={`dsh-a6-filter-btn ${availFilter === 'all' ? 'active' : ''}`}
              onClick={() => setAvailFilter('all')}
            >
              全部 ({catalog.length})
            </button>
            <button
              type="button"
              className={`dsh-a6-filter-btn ${availFilter === 'available' ? 'active' : ''}`}
              onClick={() => setAvailFilter('available')}
            >
              可用 ({availCount})
            </button>
            <button
              type="button"
              className={`dsh-a6-filter-btn ${availFilter === 'unavailable' ? 'active' : ''}`}
              onClick={() => setAvailFilter('unavailable')}
            >
              不可用 ({catalog.length - availCount})
            </button>
          </div>
          <div className="dsh-a6-filter-group">
            <button
              type="button"
              className={`dsh-a6-filter-btn ${paramFilter === 'all' ? 'active' : ''}`}
              onClick={() => setParamFilter('all')}
            >
              全部参数
            </button>
            <button
              type="button"
              className={`dsh-a6-filter-btn ${paramFilter === 'filled' ? 'active' : ''}`}
              onClick={() => setParamFilter('filled')}
            >
              已填 ({filledCount})
            </button>
            <button
              type="button"
              className={`dsh-a6-filter-btn ${paramFilter === 'empty' ? 'active' : ''}`}
              onClick={() => setParamFilter('empty')}
            >
              未填 ({catalog.length - filledCount})
            </button>
          </div>
          <div className="dsh-a6-search-wrapper">
            <input
              type="text"
              className="dsh-a6-input dsh-a6-search-input"
              placeholder="搜索模型 ID / 名称..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                type="button"
                className="dsh-a6-clear-btn"
                onClick={() => setSearch('')}
                title="清空搜索"
              >
                ×
              </button>
            )}
          </div>
        </div>
      </div>

      {msg && (
        <div className={`dsh-a6-catalog-msg ${msg.kind}`}>
          {msg.text}
        </div>
      )}

      {/* 内容 */}
      {catalog.length === 0 ? (
        <div className="dsh-a6-empty-state">
          <span>模型目录为空。</span>
          <span className="dsh-a6-hint">
            点击「从 A6API 获取市场模型」拉取全部支持的模型 ID，再用「从 OpenRouter 一键查询」自动填充参数。
          </span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="dsh-a6-empty-state">
          <span>当前筛选条件下没有匹配的模型</span>
        </div>
      ) : (
        <div className="dsh-a6-catalog-list">
          {filtered.map((entry) => {
            const editing = editingId === entry.id;
            const isAvail = availableSet.has(entry.id.toLowerCase());
            const re = entry.reasoningEfforts && typeof entry.reasoningEfforts === 'object' ? entry.reasoningEfforts : null;
            return (
              <div key={entry.id} className={`dsh-a6-catalog-row${editing ? ' editing' : ''}`}>
                {/* 第一行：模型 ID + 可用徽章 + 名称 + 操作 */}
                <div className="dsh-a6-catalog-row-head">
                  <div className="dsh-a6-catalog-id">
                    <code>{entry.id}</code>
                    {isAvail && <span className="dsh-a6-catalog-badge avail">可用</span>}
                    {entry.name && entry.name !== entry.id && (
                      <span className="dsh-a6-catalog-name">{entry.name}</span>
                    )}
                  </div>
                  <div className="dsh-a6-catalog-row-actions">
                    <button
                      type="button"
                      className="dsh-a6-btn-text"
                      onClick={() => handleQueryOne(entry.id)}
                      disabled={busy !== null}
                      data-tooltip="从 OpenRouter 查询该模型参数并填充"
                    >
                      {queryingId === entry.id ? '查询中...' : '查询参数'}
                    </button>
                    <button
                      type="button"
                      className="dsh-a6-btn-text"
                      onClick={() => (editing ? setEditingId(null) : startEdit(entry))}
                    >
                      {editing ? '取消' : '编辑'}
                    </button>
                  </div>
                </div>

                {/* 第二行：参数（统一在模型 ID 下方） */}
                <div className="dsh-a6-catalog-meta">
                  <span className={`dsh-a6-catalog-param${entry.contextWindow != null ? '' : ' empty'}`}>
                    上下文 {entry.contextWindow != null ? entry.contextWindow.toLocaleString() : '—'}
                  </span>
                  <span className={`dsh-a6-catalog-param${entry.maxTokens != null ? '' : ' empty'}`}>
                    输出 {entry.maxTokens != null ? entry.maxTokens.toLocaleString() : '—'}
                  </span>
                  <span className={`dsh-a6-catalog-param${entry.input && entry.input.length > 0 ? '' : ' empty'}`}>
                    输入 {entry.input && entry.input.length > 0 ? entry.input.join('+') : '—'}
                  </span>
                  {re && Object.keys(re).length > 0 && (
                    <span className="dsh-a6-catalog-param">
                      推理 {Object.keys(re).length} 档
                    </span>
                  )}
                  {entry.reasoningEfforts === false && (
                    <span className="dsh-a6-catalog-param">非推理</span>
                  )}
                </div>

                {editing && (
                  <div className="dsh-a6-catalog-edit">
                    <div className="dsh-a6-edit-grid">
                      <label className="dsh-a6-edit-field">
                        <span className="dsh-a6-label">名称 (name)</span>
                        <input
                          type="text"
                          className="dsh-a6-input"
                          value={draft.name}
                          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                          placeholder="仅用户填写，留空则不写入 DSH 配置"
                        />
                      </label>
                      <label className="dsh-a6-edit-field">
                        <span className="dsh-a6-label">上下文窗口 (contextWindow)</span>
                        <input
                          type="number"
                          min={1}
                          className="dsh-a6-input"
                          value={draft.contextWindow}
                          onChange={(e) => setDraft({ ...draft, contextWindow: e.target.value })}
                          placeholder="如 1048576（留空 = 不填，DSH 用默认）"
                        />
                      </label>
                      <label className="dsh-a6-edit-field">
                        <span className="dsh-a6-label">最大输出 (maxTokens)</span>
                        <input
                          type="number"
                          min={1}
                          className="dsh-a6-input"
                          value={draft.maxTokens}
                          onChange={(e) => setDraft({ ...draft, maxTokens: e.target.value })}
                          placeholder="如 65536（留空 = 不填，DSH 用默认）"
                        />
                      </label>
                      <div className="dsh-a6-edit-field">
                        <span className="dsh-a6-label">输入模态 (input)</span>
                        <div className="dsh-a6-checkbox-group">
                          <label className="dsh-a6-checkbox">
                            <input
                              type="checkbox"
                              checked={draft.inputText}
                              onChange={(e) => setDraft({ ...draft, inputText: e.target.checked })}
                            />
                            <span>text</span>
                          </label>
                          <label className="dsh-a6-checkbox">
                            <input
                              type="checkbox"
                              checked={draft.inputImage}
                              onChange={(e) => setDraft({ ...draft, inputImage: e.target.checked })}
                            />
                            <span>image</span>
                          </label>
                        </div>
                      </div>
                      <label className="dsh-a6-edit-field dsh-a6-edit-wide">
                        <span className="dsh-a6-label">
                          推理档位 (reasoningEfforts)
                          <span className="dsh-a6-field-hint" style={{ marginLeft: 6 }}>
                            格式：low: low, medium: medium；值为空表示该档位无 wire 值
                          </span>
                        </span>
                        <input
                          type="text"
                          className="dsh-a6-input"
                          value={draft.reasoningText}
                          disabled={draft.reasoningFalse}
                          onChange={(e) => setDraft({ ...draft, reasoningText: e.target.value })}
                          placeholder="默认已含 DSH 全部 7 档（off/minimal/low/medium/high/xhigh/max），可修改或留空删除该字段"
                        />
                      </label>
                      <label className="dsh-a6-edit-field">
                        <span className="dsh-a6-label">推理能力</span>
                        <label className="dsh-a6-checkbox">
                          <input
                            type="checkbox"
                            checked={draft.reasoningFalse}
                            onChange={(e) => setDraft({ ...draft, reasoningFalse: e.target.checked })}
                          />
                          <span>非推理模型 (reasoningEfforts: false)</span>
                        </label>
                      </label>
                    </div>
                    <div className="dsh-a6-edit-actions">
                      <button
                        type="button"
                        className="dsh-a6-btn dsh-a6-btn-primary dsh-a6-btn-sm"
                        onClick={() => handleSave(entry.id)}
                      >
                        保存
                      </button>
                      <button
                        type="button"
                        className="dsh-a6-btn dsh-a6-btn-secondary dsh-a6-btn-sm"
                        onClick={() => setEditingId(null)}
                      >
                        取消
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

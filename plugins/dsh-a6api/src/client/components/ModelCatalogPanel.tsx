import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  Checkbox,
  IconCloseOutline16,
  Input,
  Pill,
  Tag,
} from '@deepseek-ai/dsh-client-ui-primitives';
import type { A6apiT } from '../locales.js';
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
export const ModelCatalogPanel: React.FC<{ t: A6apiT }> = ({ t }) => {
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
        flash('err', t('msgFetchedWithFailures', { total: r.total, added: r.added, pages: r.failedPages }));
      } else {
        flash('ok', t('msgFetched', { total: r.total, added: r.added }));
      }
    } else flash('err', r.error || t('errFetch'));
  };

  const handleQueryAll = async () => {
    const r = await store.queryOpenRouter();
    if (r.ok) {
      const nf = r.notFound?.length || 0;
      flash(
        'ok',
        nf > 0
          ? t('msgQueriedAll', { updated: r.updated }) + t('msgQueriedAllNotFound', { notFound: nf })
          : t('msgQueriedAll', { updated: r.updated }),
      );
    } else flash('err', r.error || t('errQuery'));
  };

  const handleQueryOne = async (id: string) => {
    setQueryingId(id);
    const r = await store.queryOpenRouter([id]);
    setQueryingId(null);
    if (r.ok) {
      if ((r.updated || 0) > 0) flash('ok', t('msgQueriedOne', { id }));
      else flash('ok', t('msgQueriedOneNotFound', { id }));
    } else flash('err', r.error || t('errQuery'));
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
    if (r.ok) flash('ok', t('msgCleared'));
    else flash('err', r.error || t('errClear'));
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
        flash('err', t('errContextWindow'));
        return;
      }
      patch.contextWindow = ctx;
    } else {
      patch.contextWindow = null as any; // 清空 = 删除字段
    }
    const maxT = Number(draft.maxTokens);
    if (draft.maxTokens.trim() !== '') {
      if (!Number.isInteger(maxT) || maxT < 1) {
        flash('err', t('errMaxTokens'));
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
          flash('err', t('errReasoningFormat'));
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
      flash(
        'ok',
        t('msgSaved', { id }) +
          (store.getState().dshConfiguredModels.some((m) => m.toLowerCase() === id.toLowerCase())
            ? t('msgSavedSynced')
            : ''),
      );
    } else {
      flash('err', r.error || t('errSave'));
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
          <Button
            variant="primary"
            size="sm"
            onClick={handleFetchMarket}
            disabled={busy !== null}
            data-tooltip={t('fetchMarketTip')}
            data-tooltip-pos="down"
          >
            {busy === 'fetch' ? t('fetching') : t('fetchMarket')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleQueryAll}
            disabled={busy !== null || catalog.length === 0}
            data-tooltip={t('queryOpenRouterTip')}
            data-tooltip-pos="down"
          >
            {busy === 'query' ? t('querying') : t('queryOpenRouter')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleClear}
            disabled={busy !== null || catalog.length === 0}
            data-tooltip={t('clearCatalogTip')}
            data-tooltip-pos="down"
          >
            {confirmClear ? t('confirmClear') : t('clearCatalog')}
          </Button>
          <div className="dsh-a6-catalog-count">
            {t('catalogCount', { total: catalog.length, avail: availCount, filled: filledCount })}
          </div>
        </div>

        {/* 筛选区 */}
        <div className="dsh-a6-catalog-filters">
          <div className="dsh-a6-filter-group">
            <Pill active={availFilter === 'all'} onClick={() => setAvailFilter('all')}>
              {t('filterCatalogAll', { count: catalog.length })}
            </Pill>
            <Pill active={availFilter === 'available'} onClick={() => setAvailFilter('available')}>
              {t('filterCatalogAvailable', { count: availCount })}
            </Pill>
            <Pill active={availFilter === 'unavailable'} onClick={() => setAvailFilter('unavailable')}>
              {t('filterCatalogUnavailable', { count: catalog.length - availCount })}
            </Pill>
          </div>
          <div className="dsh-a6-filter-group">
            <Pill active={paramFilter === 'all'} onClick={() => setParamFilter('all')}>
              {t('filterParamAll')}
            </Pill>
            <Pill active={paramFilter === 'filled'} onClick={() => setParamFilter('filled')}>
              {t('filterParamFilled', { count: filledCount })}
            </Pill>
            <Pill active={paramFilter === 'empty'} onClick={() => setParamFilter('empty')}>
              {t('filterParamEmpty', { count: catalog.length - filledCount })}
            </Pill>
          </div>
          <div className="dsh-a6-search-wrapper">
            <Input
              className="dsh-a6-search-input"
              type="text"
              placeholder={t('catalogSearchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <Button
                variant="ghost"
                size="sm"
                icon={<IconCloseOutline16 />}
                aria-label={t('clearSearch')}
                title={t('clearSearch')}
                onClick={() => setSearch('')}
              />
            )}
          </div>
        </div>
      </div>

      {msg && <div className={`dsh-a6-catalog-msg ${msg.kind}`}>{msg.text}</div>}

      {/* 内容 */}
      {catalog.length === 0 ? (
        <div className="dsh-a6-empty-state">
          <span>{t('emptyCatalog')}</span>
          <span className="dsh-a6-hint">{t('emptyCatalogHint')}</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="dsh-a6-empty-state">
          <span>{t('emptyFiltered')}</span>
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
                    {isAvail && <Tag tone="success">{t('badgeAvailable')}</Tag>}
                    {entry.name && entry.name !== entry.id && (
                      <span className="dsh-a6-catalog-name">{entry.name}</span>
                    )}
                  </div>
                  <div className="dsh-a6-catalog-row-actions">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleQueryOne(entry.id)}
                      disabled={busy !== null}
                      data-tooltip={t('queryOneTip')}
                    >
                      {queryingId === entry.id ? t('querying') : t('queryOne')}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => (editing ? setEditingId(null) : startEdit(entry))}
                    >
                      {editing ? t('cancel') : t('edit')}
                    </Button>
                  </div>
                </div>

                {/* 第二行：参数（统一在模型 ID 下方） */}
                <div className="dsh-a6-catalog-meta">
                  <Tag tone={entry.contextWindow != null ? 'success' : 'outline'}>
                    {t('paramContext', {
                      value: entry.contextWindow != null ? entry.contextWindow.toLocaleString() : '—',
                    })}
                  </Tag>
                  <Tag tone={entry.maxTokens != null ? 'success' : 'outline'}>
                    {t('paramOutput', {
                      value: entry.maxTokens != null ? entry.maxTokens.toLocaleString() : '—',
                    })}
                  </Tag>
                  <Tag tone={entry.input && entry.input.length > 0 ? 'success' : 'outline'}>
                    {t('paramInput', {
                      value: entry.input && entry.input.length > 0 ? entry.input.join('+') : '—',
                    })}
                  </Tag>
                  {re && Object.keys(re).length > 0 && (
                    <Tag tone="success">{t('paramReasoning', { count: Object.keys(re).length })}</Tag>
                  )}
                  {entry.reasoningEfforts === false && (
                    <Tag tone="neutral">{t('paramNonReasoning')}</Tag>
                  )}
                </div>

                {editing && (
                  <div className="dsh-a6-catalog-edit">
                    <div className="dsh-a6-edit-grid">
                      <label className="dsh-a6-edit-field">
                        <span className="dsh-a6-label">{t('fieldName')}</span>
                        <Input
                          type="text"
                          value={draft.name}
                          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                          placeholder={t('fieldNamePlaceholder')}
                        />
                      </label>
                      <label className="dsh-a6-edit-field">
                        <span className="dsh-a6-label">{t('fieldContext')}</span>
                        <Input
                          type="number"
                          min={1}
                          value={draft.contextWindow}
                          onChange={(e) => setDraft({ ...draft, contextWindow: e.target.value })}
                          placeholder={t('fieldContextPlaceholder')}
                        />
                      </label>
                      <label className="dsh-a6-edit-field">
                        <span className="dsh-a6-label">{t('fieldMaxTokens')}</span>
                        <Input
                          type="number"
                          min={1}
                          value={draft.maxTokens}
                          onChange={(e) => setDraft({ ...draft, maxTokens: e.target.value })}
                          placeholder={t('fieldMaxTokensPlaceholder')}
                        />
                      </label>
                      <div className="dsh-a6-edit-field">
                        <span className="dsh-a6-label">{t('fieldInput')}</span>
                        <div className="dsh-a6-checkbox-group">
                          <Checkbox
                            checked={draft.inputText}
                            onChange={(next) => setDraft({ ...draft, inputText: next })}
                            label="text"
                          />
                          <Checkbox
                            checked={draft.inputImage}
                            onChange={(next) => setDraft({ ...draft, inputImage: next })}
                            label="image"
                          />
                        </div>
                      </div>
                      <label className="dsh-a6-edit-field dsh-a6-edit-wide">
                        <span className="dsh-a6-label">
                          {t('fieldReasoning')}
                          <span className="dsh-a6-field-hint dsh-a6-field-hint-inline">
                            {t('fieldReasoningFormat')}
                          </span>
                        </span>
                        <Input
                          type="text"
                          value={draft.reasoningText}
                          disabled={draft.reasoningFalse}
                          onChange={(e) => setDraft({ ...draft, reasoningText: e.target.value })}
                          placeholder={t('fieldReasoningPlaceholder')}
                        />
                      </label>
                      <div className="dsh-a6-edit-field">
                        <span className="dsh-a6-label">{t('fieldReasoningCapability')}</span>
                        <Checkbox
                          checked={draft.reasoningFalse}
                          onChange={(next) => setDraft({ ...draft, reasoningFalse: next })}
                          label={t('fieldNonReasoning')}
                        />
                      </div>
                    </div>
                    <div className="dsh-a6-edit-actions">
                      <Button variant="primary" size="sm" onClick={() => handleSave(entry.id)}>
                        {t('save')}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setEditingId(null)}>
                        {t('cancel')}
                      </Button>
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
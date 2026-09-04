window.__ModuleLoader__.load({ id: "@lynn123411/dsh-chat-translate", factory: (require) => { var module = { exports: {} }; var exports = module.exports;
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.ts
var index_exports = {};
__export(index_exports, {
  NonDestructiveTranslationMount: () => NonDestructiveTranslationMount,
  StreamDebounceViewportObserver: () => StreamDebounceViewportObserver,
  apply: () => apply,
  chatTranslateObserver: () => chatTranslateObserver,
  clientCache: () => clientCache,
  inject: () => inject,
  lazyQueue: () => lazyQueue,
  name: () => name,
  settingsStore: () => settingsStore,
  setupSettingsUi: () => setupSettingsUi
});
module.exports = __toCommonJS(index_exports);

// src/client/translate/client-cache.ts
var CACHE_KEY = "dsh-chat-translate:cache";
var MAX_LOCAL_ENTRIES = 500;
var TTL_MS = 7 * 24 * 60 * 60 * 1e3;
var ClientCache = class {
  // Map preserves insertion order in JS, enabling true LRU semantics.
  memCache = /* @__PURE__ */ new Map();
  dirty = false;
  saveTimer = null;
  constructor() {
    this.load();
  }
  load() {
    if (typeof localStorage === "undefined") return;
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        const obj = JSON.parse(raw);
        if (obj && typeof obj === "object") {
          for (const [k, entry] of Object.entries(obj)) {
            if (typeof entry === "string") {
              this.memCache.set(k, { t: 0, v: entry });
            } else if (entry && typeof entry === "object" && typeof entry.v === "string") {
              this.memCache.set(k, entry);
            }
          }
        }
      }
    } catch {
    }
  }
  get(text) {
    const key = text.trim().toLowerCase();
    const entry = this.memCache.get(key);
    if (entry === void 0) return void 0;
    if (entry.v && entry.v.trim().toLowerCase() === key) {
      this.memCache.delete(key);
      this.dirty = true;
      this.scheduleSave();
      return void 0;
    }
    if (entry.t > 0 && Date.now() - entry.t > TTL_MS) {
      this.memCache.delete(key);
      this.dirty = true;
      this.scheduleSave();
      return void 0;
    }
    this.memCache.delete(key);
    this.memCache.set(key, entry);
    return entry.v;
  }
  set(text, translated) {
    const key = text.trim().toLowerCase();
    if (this.memCache.has(key)) {
      this.memCache.delete(key);
    } else if (this.memCache.size >= MAX_LOCAL_ENTRIES) {
      const oldestKey = this.memCache.keys().next().value;
      if (oldestKey !== void 0) {
        this.memCache.delete(oldestKey);
      }
    }
    this.memCache.set(key, { t: Date.now(), v: translated });
    this.dirty = true;
    this.scheduleSave();
  }
  scheduleSave() {
    if (this.saveTimer !== null || typeof window === "undefined") return;
    this.saveTimer = window.setTimeout(() => {
      this.saveTimer = null;
      this.flushSync();
    }, 2e3);
  }
  flushSync() {
    if (!this.dirty || typeof localStorage === "undefined") return;
    this.dirty = false;
    try {
      const obj = {};
      for (const [k, v] of this.memCache.entries()) {
        obj[k] = v;
      }
      localStorage.setItem(CACHE_KEY, JSON.stringify(obj));
    } catch {
    }
  }
  clear() {
    this.memCache.clear();
    this.dirty = true;
    this.flushSync();
  }
  size() {
    return this.memCache.size;
  }
};
var clientCache = new ClientCache();

// src/client/translate/api.ts
async function requestTranslateBatch(texts, options = {}) {
  if (!Array.isArray(texts) || texts.length === 0) return [];
  const validTexts = texts.map((t) => typeof t === "string" ? t : "");
  if (validTexts.length === 0) return [];
  const controller = new AbortController();
  const timeoutId = options.timeoutMs ? setTimeout(() => controller.abort(), options.timeoutMs) : null;
  const effectiveSignal = options.signal ? options.signal.aborted ? options.signal : controller.signal : controller.signal;
  if (options.signal) {
    options.signal.addEventListener("abort", () => controller.abort(), { once: true });
  }
  try {
    const res = await fetch("/api/dsh-chat-translate/translate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ texts: validTexts }),
      signal: effectiveSignal
    });
    if (res.ok) {
      const data = await res.json();
      if (data.ok && Array.isArray(data.results) && data.results.length > 0) {
        return data.results;
      } else if (data.error) {
        console.warn(`[dsh-chat-translate] \u7FFB\u8BD1\u63A5\u53E3\u9519\u8BEF: ${data.error}`);
      }
    } else {
      console.warn(`[dsh-chat-translate] \u7FFB\u8BD1\u8BF7\u6C42\u5931\u8D25 (HTTP ${res.status})`);
    }
  } catch (err) {
    if (err?.name === "AbortError") {
    }
  } finally {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
  }
  return validTexts.map((t) => ({
    original: t,
    translated: t,
    channel: "fallback-client",
    cached: false
  }));
}
async function testServerChannel(channel) {
  try {
    const res = await fetch("/api/dsh-chat-translate/test-channel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel })
    });
    return await res.json();
  } catch (err) {
    return { ok: false, latencyMs: 0, error: err?.message || String(err) };
  }
}

// src/client/translate/mount.ts
var CLASS_ORIGINAL_HIDDEN = "dsh-tidy-original-hidden";
var CLASS_ORIGINAL_SHOWN = "dsh-tidy-original-shown";
var CLASS_TRANSLATED_BLOCK = "dsh-tidy-translated-block";
var NonDestructiveTranslationMount = class {
  /**
   * Mounts a translated string onto the target element non-destructively.
   */
  static mount(element, translated, options = {}) {
    if (!element || !element.ownerDocument) return;
    const doc = element.ownerDocument;
    let transWrapper = element.querySelector(`:scope > .${CLASS_TRANSLATED_BLOCK}`);
    let origWrapper = element.querySelector(
      `:scope > .${CLASS_ORIGINAL_HIDDEN}, :scope > .${CLASS_ORIGINAL_SHOWN}`
    );
    if (transWrapper && origWrapper) {
      transWrapper.textContent = translated;
      element.dataset.tidyTranslated = "true";
      if (options.isThink) element.dataset.tidyThink = "true";
      if (options.originalText) element.dataset.original = options.originalText;
      return;
    }
    const originalText = options.originalText ?? this.extractVisibleText(element);
    origWrapper = doc.createElement("span");
    origWrapper.className = CLASS_ORIGINAL_HIDDEN;
    origWrapper.style.display = "none";
    while (element.firstChild) {
      origWrapper.appendChild(element.firstChild);
    }
    transWrapper = doc.createElement("span");
    transWrapper.className = CLASS_TRANSLATED_BLOCK;
    transWrapper.textContent = translated;
    const interactive = options.interactive !== false;
    if (interactive) {
      const showOriginal = (e) => {
        e.stopPropagation();
        if (!origWrapper || !transWrapper) return;
        origWrapper.style.display = "inline";
        origWrapper.className = CLASS_ORIGINAL_SHOWN;
        transWrapper.style.display = "none";
      };
      const showTranslated = (e) => {
        e.stopPropagation();
        if (!origWrapper || !transWrapper) return;
        origWrapper.style.display = "none";
        origWrapper.className = CLASS_ORIGINAL_HIDDEN;
        transWrapper.style.display = "inline";
      };
      transWrapper.addEventListener("click", showOriginal);
      origWrapper.addEventListener("click", showTranslated);
    }
    element.appendChild(transWrapper);
    element.appendChild(origWrapper);
    element.dataset.tidyTranslated = "true";
    element.dataset.original = originalText;
    if (options.isThink) {
      element.dataset.tidyThink = "true";
    }
  }
  /**
   * Unmounts translation and restores original DOM nodes completely.
   */
  static unmount(element) {
    if (!element) return;
    const origWrapper = element.querySelector(
      `:scope > .${CLASS_ORIGINAL_HIDDEN}, :scope > .${CLASS_ORIGINAL_SHOWN}`
    );
    const transWrapper = element.querySelector(`:scope > .${CLASS_TRANSLATED_BLOCK}`);
    if (origWrapper) {
      while (origWrapper.firstChild) {
        element.insertBefore(origWrapper.firstChild, origWrapper);
      }
      origWrapper.remove();
    }
    if (transWrapper) {
      transWrapper.remove();
    }
    if (!origWrapper && element.dataset.original) {
      element.textContent = element.dataset.original;
    }
    delete element.dataset.tidyTranslated;
    delete element.dataset.original;
    delete element.dataset.tidyThink;
  }
  /**
   * Checks if an element has non-destructive translation mounted.
   */
  static isMounted(element) {
    return element.dataset.tidyTranslated === "true" && !!element.querySelector(`:scope > .${CLASS_TRANSLATED_BLOCK}`);
  }
  /**
   * Gets the original text recorded on the element or contained in origWrapper.
   */
  static getOriginal(element) {
    if (element.dataset.original) return element.dataset.original;
    const origWrapper = element.querySelector(
      `:scope > .${CLASS_ORIGINAL_HIDDEN}, :scope > .${CLASS_ORIGINAL_SHOWN}`
    );
    return origWrapper ? origWrapper.textContent?.trim() : void 0;
  }
  /**
   * Extracts text content excluding our own translation wrappers.
   */
  static extractVisibleText(element) {
    const origWrapper = element.querySelector(
      `:scope > .${CLASS_ORIGINAL_HIDDEN}, :scope > .${CLASS_ORIGINAL_SHOWN}`
    );
    if (origWrapper) {
      return origWrapper.textContent?.trim() || "";
    }
    const transWrapper = element.querySelector(`:scope > .${CLASS_TRANSLATED_BLOCK}`);
    if (transWrapper) {
      return transWrapper.textContent?.trim() || "";
    }
    return element.textContent?.trim() || "";
  }
};

// src/client/translate/viewport-observer.ts
var StreamDebounceViewportObserver = class {
  intersectionObserver = null;
  streamingTimers = /* @__PURE__ */ new WeakMap();
  pendingQueue = [];
  batchFlushTimer = null;
  options;
  constructor(options) {
    this.options = {
      rootMargin: options.rootMargin ?? "150px 0px",
      debounceMs: options.debounceMs ?? 400,
      onVisibleBatch: options.onVisibleBatch
    };
    this.initIntersectionObserver();
  }
  initIntersectionObserver() {
    if (typeof window === "undefined" || typeof IntersectionObserver === "undefined") {
      return;
    }
    this.intersectionObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.target instanceof HTMLElement) {
            const el = entry.target;
            this.intersectionObserver?.unobserve(el);
            const text = el.dataset.tidyPendingText || el.textContent?.trim() || "";
            const isThink = el.dataset.tidyPendingThink === "true";
            if (text) {
              delete el.dataset.tidyPendingText;
              delete el.dataset.tidyPendingThink;
              this.enqueueBatch(el, text, isThink);
            }
          }
        }
      },
      {
        root: null,
        // viewport
        rootMargin: this.options.rootMargin,
        threshold: 0
      }
    );
  }
  /**
   * Observe an element with streaming debounce.
   * If streaming updates characterData repeatedly within debounceMs, the timer resets.
   */
  observeWithDebounce(element, text, immediate = false, isThink = false) {
    if (!element || !text) return;
    const existingTimer = this.streamingTimers.get(element);
    if (existingTimer !== void 0) {
      clearTimeout(existingTimer);
      this.streamingTimers.delete(element);
    }
    if (immediate || this.options.debounceMs <= 0) {
      this.registerForViewport(element, text, isThink);
      return;
    }
    const timer = window.setTimeout(() => {
      this.streamingTimers.delete(element);
      if (element.isConnected) {
        const latestText = element.textContent?.trim() || text;
        this.registerForViewport(element, latestText, isThink);
      }
    }, this.options.debounceMs);
    this.streamingTimers.set(element, timer);
  }
  registerForViewport(element, text, isThink = false) {
    if (!element.isConnected) return;
    if (!this.intersectionObserver) {
      this.enqueueBatch(element, text, isThink);
      return;
    }
    element.dataset.tidyPendingText = text;
    if (isThink) element.dataset.tidyPendingThink = "true";
    this.intersectionObserver.observe(element);
  }
  enqueueBatch(element, text, isThink = false) {
    this.pendingQueue.push({ element, text, isThink });
    if (this.batchFlushTimer === null && typeof window !== "undefined") {
      this.batchFlushTimer = window.setTimeout(() => {
        this.batchFlushTimer = null;
        this.flushQueue();
      }, 50);
    }
  }
  flushQueue() {
    if (this.pendingQueue.length === 0) return;
    const batch = [...this.pendingQueue];
    this.pendingQueue = [];
    this.options.onVisibleBatch(batch);
  }
  unobserve(element) {
    const timer = this.streamingTimers.get(element);
    if (timer !== void 0) {
      clearTimeout(timer);
      this.streamingTimers.delete(element);
    }
    delete element.dataset.tidyPendingText;
    delete element.dataset.tidyPendingThink;
    if (this.intersectionObserver) {
      this.intersectionObserver.unobserve(element);
    }
  }
  disconnect() {
    if (this.batchFlushTimer !== null) {
      clearTimeout(this.batchFlushTimer);
      this.batchFlushTimer = null;
    }
    this.pendingQueue = [];
    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect();
      this.initIntersectionObserver();
    }
  }
};

// src/client/translate/lazy.ts
var LazyTranslationQueue = class {
  enabled = true;
  viewportObserver;
  constructor() {
    this.viewportObserver = new StreamDebounceViewportObserver({
      rootMargin: "150px 0px",
      debounceMs: 400,
      onVisibleBatch: (items) => this.handleVisibleBatch(items)
    });
  }
  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled) {
      this.viewportObserver.disconnect();
    }
  }
  observe(element, text, immediate = false, isThink = false) {
    if (!this.enabled || !element.isConnected) return;
    const cached = clientCache.get(text);
    if (cached) {
      this.applyTranslation(element, cached, text, isThink);
      return;
    }
    this.viewportObserver.observeWithDebounce(element, text, immediate, isThink);
  }
  async handleVisibleBatch(items) {
    if (!this.enabled || items.length === 0) return;
    const sorted = [...items].sort((a, b) => {
      if (a.element === b.element) return 0;
      const pos = a.element.compareDocumentPosition(b.element);
      return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    });
    const textMap = /* @__PURE__ */ new Map();
    for (const item of sorted) {
      if (!item.element.isConnected) continue;
      const cached = clientCache.get(item.text);
      if (cached) {
        this.applyTranslation(item.element, cached, item.text, item.isThink);
        continue;
      }
      const list = textMap.get(item.text) || [];
      list.push({ element: item.element, isThink: item.isThink });
      textMap.set(item.text, list);
    }
    const uniqueTexts = Array.from(textMap.keys());
    if (uniqueTexts.length === 0) return;
    const results = await requestTranslateBatch(uniqueTexts);
    for (const res of results) {
      if (res.translated && res.translated.trim() && res.channel !== "fallback" && res.channel !== "fallback-client" && res.translated.trim() !== res.original.trim()) {
        clientCache.set(res.original, res.translated);
        const entries = textMap.get(res.original) || [];
        for (const entry of entries) {
          if (entry.element.isConnected && this.enabled) {
            this.applyTranslation(entry.element, res.translated, res.original, entry.isThink);
          }
        }
      } else if (res.channel === "fallback" || res.channel === "fallback-client") {
        console.debug(`[dsh-chat-translate] \u7FFB\u8BD1\u672A\u6210\u529F (\u964D\u7EA7\u4FDD\u7559\u539F\u6587): "${res.original.slice(0, 40)}"`);
      }
    }
  }
  applyTranslation(element, translated, original, isThink) {
    if (!element.isConnected || !this.enabled) return;
    NonDestructiveTranslationMount.mount(element, translated, {
      originalText: original,
      isThink: isThink || element.dataset.tidyThink === "true"
    });
  }
  disconnect() {
    this.viewportObserver.disconnect();
  }
};
var lazyQueue = new LazyTranslationQueue();

// src/client/translate/observer.ts
var TOOL_TITLE_SELECTOR = '[class*="summary"]';
var SESSION_ROOT_SELECTOR = "[data-conversation-scroll], [data-chat-flow]";
var ROOT_CHECK_INTERVAL_MS = 3e3;
function isToolSummarySpan(span) {
  if (!span || span.nodeType !== 1) return false;
  if (span.hasAttribute("aria-hidden")) return false;
  if (span.querySelector?.('[class*="title"], [class*="leading"], [class*="chevron"], [class*="sep"], [class*="summary"]')) {
    return false;
  }
  const cls = span.className || "";
  if (/title|leading|icon|badge|chevron|separator|sep\b|row\b|root\b|card\b/i.test(cls)) return false;
  const rawToggle = (span.textContent || "").trim();
  if (rawToggle.length <= 12 && /^(展开|收起|展开全部|收起全部|Expand|Collapse|Show more|Show less|Think|思考)$/i.test(rawToggle)) {
    return false;
  }
  if (rawToggle === "Think" || rawToggle === "\u601D\u8003") return false;
  if (span.closest('button, [role="button"]') && rawToggle.length <= 12 && /展开|收起|Expand|Collapse|Think|思考/i.test(rawToggle)) {
    return false;
  }
  if (span.closest(
    '[data-chat-call-id], [data-slot="tool.call.toolview"], [data-sample], [data-variant], [data-tool], [data-disclosure-row]'
  )) {
    return true;
  }
  return false;
}
var ChatTranslateObserver = class {
  observer = null;
  rootElement = null;
  rootCheckTimer = null;
  isEnabled = true;
  constructor() {
    this.handleMutations = this.handleMutations.bind(this);
  }
  setEnabled(enabled) {
    this.isEnabled = enabled;
    if (enabled) {
      lazyQueue.setEnabled(true);
      this.start();
    } else {
      this.restoreOriginals();
      this.disconnect();
      lazyQueue.setEnabled(false);
    }
  }
  restoreOriginals() {
    const scope = this.rootElement ?? document;
    const spans = scope.querySelectorAll('[data-tidy-translated="true"]');
    for (const span of spans) {
      NonDestructiveTranslationMount.unmount(span);
    }
  }
  /**
   * The active session's scroll container. Only the currently-viewed session
   * is translated; switching sessions replaces this subtree and the observer
   * naturally follows the new content.
   */
  isVisible(el) {
    if (el.hasAttribute("hidden")) return false;
    if (el.style.display === "none") return false;
    try {
      return el.getClientRects().length > 0;
    } catch {
      return true;
    }
  }
  findRoot(documentRef) {
    if (!documentRef.body) {
      return documentRef.documentElement;
    }
    const candidates = documentRef.querySelectorAll(SESSION_ROOT_SELECTOR);
    for (const el of candidates) {
      if (this.isVisible(el)) {
        return el;
      }
    }
    return documentRef.body;
  }
  start(documentRef = document) {
    if (!this.isEnabled || typeof window === "undefined") {
      return () => {
      };
    }
    const findAndObserveRoot = () => {
      const root = this.findRoot(documentRef);
      this.rootElement = root;
      this.scanContainer(root);
      if (!this.observer) {
        this.observer = new MutationObserver(this.handleMutations);
        this.observer.observe(root, {
          childList: true,
          subtree: true,
          attributes: true,
          characterData: true,
          attributeFilter: ["data-state", "data-tool", "data-variant", "data-sample", "aria-expanded"]
        });
      }
    };
    findAndObserveRoot();
    this.scheduleRootCheck();
    return () => {
      this.disconnect();
    };
  }
  scheduleRootCheck() {
    if (this.rootCheckTimer !== null || typeof window === "undefined") return;
    this.rootCheckTimer = window.setInterval(() => {
      if (this.rootElement && this.rootElement.isConnected && this.isVisible(this.rootElement)) {
        return;
      }
      this.restart();
    }, ROOT_CHECK_INTERVAL_MS);
  }
  restart() {
    if (typeof window === "undefined") return;
    const wasEnabled = this.isEnabled;
    this.disconnect();
    if (wasEnabled) {
      this.start();
    }
  }
  handleMutations(mutations) {
    if (!this.isEnabled) return;
    for (const mutation of mutations) {
      if (mutation.type === "childList") {
        for (let i = 0; i < mutation.addedNodes.length; i++) {
          const node = mutation.addedNodes[i];
          if (node instanceof HTMLElement) {
            if (node.classList?.contains("dsh-tidy-translated-block") || node.classList?.contains("dsh-tidy-original-hidden") || node.classList?.contains("dsh-tidy-original-shown")) {
              continue;
            }
            this.scanNode(node);
          }
        }
      } else if (mutation.type === "attributes") {
        const target = mutation.target;
        if (target instanceof HTMLElement) {
          if (target.classList?.contains("dsh-tidy-translated-block") || target.classList?.contains("dsh-tidy-original-hidden") || target.classList?.contains("dsh-tidy-original-shown")) {
            continue;
          }
          this.scanNode(target);
        }
      } else if (mutation.type === "characterData") {
        const parent = mutation.target.parentElement;
        if (parent instanceof HTMLElement) {
          if (parent.classList?.contains("dsh-tidy-translated-block") || parent.classList?.contains("dsh-tidy-original-hidden") || parent.classList?.contains("dsh-tidy-original-shown")) {
            continue;
          }
          this.scanNode(parent);
        }
      }
    }
  }
  scanContainer(container) {
    const spans = container.querySelectorAll(TOOL_TITLE_SELECTOR);
    spans.forEach((span) => {
      if (isToolSummarySpan(span)) {
        this.processSpan(span);
      }
    });
  }
  scanNode(node) {
    if (node.matches?.(TOOL_TITLE_SELECTOR) && isToolSummarySpan(node)) {
      this.processSpan(node);
    }
    const spans = node.querySelectorAll(TOOL_TITLE_SELECTOR);
    spans.forEach((span) => {
      if (isToolSummarySpan(span)) {
        this.processSpan(span);
      }
    });
  }
  processSpan(span) {
    if (NonDestructiveTranslationMount.isMounted(span)) {
      const original = NonDestructiveTranslationMount.getOriginal(span);
      if (original) {
        const cached2 = clientCache.get(original);
        if (cached2) return;
      }
      return;
    }
    const text = NonDestructiveTranslationMount.extractVisibleText(span);
    if (!text) return;
    const cached = clientCache.get(text);
    if (cached) {
      NonDestructiveTranslationMount.mount(span, cached, {
        originalText: text
      });
      return;
    }
    lazyQueue.observe(span, text);
  }
  disconnect() {
    if (this.rootCheckTimer !== null) {
      clearInterval(this.rootCheckTimer);
      this.rootCheckTimer = null;
    }
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    lazyQueue.disconnect();
    this.rootElement = null;
  }
};
var chatTranslateObserver = new ChatTranslateObserver();

// src/client/settings/ui.tsx
var import_react = require("react");

// src/client/settings/store.ts
var SETTINGS_NAMESPACE = "dsh-chat-translate";
var TRANSLATE_API_KEY_REF = "TRANSLATE_API_KEY";
var DEFAULT_STATE = {
  enabled: true,
  concurrency: 3,
  aiEnabled: true,
  bingEnabled: true,
  baseUrl: "",
  model: "",
  aiConfigured: false
};
var SettingsStore = class {
  state = { ...DEFAULT_STATE };
  listeners = /* @__PURE__ */ new Set();
  scope = null;
  credentials = null;
  unsubscribeScope = null;
  keyConfigured = false;
  writeTimer = null;
  pendingFields = /* @__PURE__ */ new Set();
  /**
   * Bind the DSH services. Called once from the settings UI setup; re-binding
   * (e.g. after a reconnect) detaches the previous subscription first.
   */
  attach(scope, credentials) {
    if (this.unsubscribeScope) {
      this.unsubscribeScope();
      this.unsubscribeScope = null;
    }
    this.scope = scope;
    this.credentials = credentials;
    if (scope) {
      this.unsubscribeScope = scope.subscribe(() => this.derive());
      this.derive();
    }
    void this.refreshKeyStatus();
  }
  getState() {
    return { ...this.state };
  }
  subscribe(listener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  /** Map the resolved namespace value into client state and notify. */
  derive() {
    if (!this.scope) return;
    const snap = this.scope.getSnapshot();
    const value = snap.value;
    if (!value || typeof value !== "object") return;
    const next = { ...this.state };
    if (typeof value.enabled === "boolean") next.enabled = value.enabled;
    const c = value.concurrency;
    if (typeof c === "number" && Number.isFinite(c)) {
      next.concurrency = Math.min(Math.max(Math.round(c), 1), 100);
    }
    if (typeof value.aiEnabled === "boolean") next.aiEnabled = value.aiEnabled;
    if (typeof value.bingEnabled === "boolean") next.bingEnabled = value.bingEnabled;
    if (typeof value.baseUrl === "string") next.baseUrl = value.baseUrl;
    if (typeof value.model === "string") next.model = value.model;
    this.applyState(next);
  }
  applyState(next) {
    next.aiConfigured = Boolean(next.baseUrl && next.model && this.keyConfigured);
    const enabledChanged = next.enabled !== this.state.enabled;
    this.state = next;
    if (enabledChanged) {
      try {
        chatTranslateObserver.setEnabled(this.state.enabled);
      } catch {
      }
    }
    this.notify();
  }
  notify() {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
      }
    }
  }
  /** Pull the key's status-only view and re-derive aiConfigured. */
  async refreshKeyStatus() {
    if (!this.credentials) return;
    try {
      const res = await this.credentials.describe([TRANSLATE_API_KEY_REF]);
      if (!res.ok) return;
      const info = res.value[TRANSLATE_API_KEY_REF];
      const configured = Boolean(info?.configured);
      if (configured !== this.keyConfigured) {
        this.keyConfigured = configured;
        this.applyState({ ...this.state });
      }
    } catch {
    }
  }
  /**
   * Optimistically apply locally, then persist each touched field through the
   * settings scope. Writes are trailing-debounced (300ms) so typing in the
   * baseUrl/model inputs collapses into a single queued mutation instead of
   * one write per keystroke — which would otherwise flash stale mirror values
   * back into the inputs between commits. A failed write makes the scope
   * reload its mirror, which re-derives this store from the host document
   * (conflict-safe recovery).
   */
  async update(partial) {
    let sanitizedConcurrency = this.state.concurrency;
    if (typeof partial.concurrency === "number" && Number.isFinite(partial.concurrency)) {
      sanitizedConcurrency = Math.min(Math.max(Math.round(partial.concurrency), 1), 100);
    }
    const next = {
      ...this.state,
      ...partial,
      concurrency: sanitizedConcurrency
    };
    this.applyState(next);
    if (this.scope) {
      const fields = ["enabled", "concurrency", "aiEnabled", "bingEnabled", "baseUrl", "model"];
      for (const field of fields) {
        if (partial[field] !== void 0) {
          this.pendingFields.add(field);
        }
      }
      this.scheduleWrite();
    }
  }
  scheduleWrite() {
    if (this.writeTimer !== null || typeof window === "undefined") return;
    this.writeTimer = window.setTimeout(() => {
      this.writeTimer = null;
      void this.flushWrite();
    }, 300);
  }
  async flushWrite() {
    if (!this.scope) return;
    const fields = [...this.pendingFields];
    this.pendingFields.clear();
    const writes = [];
    for (const field of fields) {
      writes.push(this.scope.set(field, this.state[field]));
    }
    await Promise.all(writes).catch(() => {
    });
  }
  async testChannel(channel) {
    return testServerChannel(channel);
  }
  /** Write (or clear) the API key through the credentials Remote API. */
  async saveApiKey(apiKey) {
    if (!this.credentials) {
      return { ok: false, error: "\u51ED\u636E\u670D\u52A1\u4E0D\u53EF\u7528\uFF08\u975E\u56DE\u73AF\u9875\u9762\uFF09" };
    }
    try {
      const key = apiKey.trim();
      const res = key ? await this.credentials.set(TRANSLATE_API_KEY_REF, key) : await this.credentials.unset(TRANSLATE_API_KEY_REF);
      if (!res.ok) {
        return { ok: false, error: res.error?.message || "\u4FDD\u5B58\u5931\u8D25" };
      }
      await this.refreshKeyStatus();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err?.message || String(err) };
    }
  }
  dispose() {
    if (this.writeTimer !== null && typeof window !== "undefined") {
      clearTimeout(this.writeTimer);
      this.writeTimer = null;
    }
    this.pendingFields.clear();
    if (this.unsubscribeScope) {
      this.unsubscribeScope();
      this.unsubscribeScope = null;
    }
    this.scope = null;
    this.credentials = null;
    this.listeners.clear();
  }
};
var settingsStore = new SettingsStore();

// src/client/settings/styles.ts
var SETTINGS_CSS = String.raw`
.dsh-tidy-settings {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 580px;
  padding-bottom: 32px;
  color: var(--dsw-alias-label-primary, inherit);
  font-family: inherit;
}

.dsh-tidy-card {
  border: 1px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.2));
  border-radius: 12px;
  padding: 16px 18px;
  background: var(--dsw-alias-bg-card, rgba(128, 128, 128, 0.05));
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.dsh-tidy-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary, inherit);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.dsh-tidy-desc {
  font-size: 12px;
  line-height: 1.5;
  color: var(--dsw-alias-label-secondary, rgba(128, 128, 128, 0.8));
}

.dsh-tidy-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 8px 0;
}

.dsh-tidy-row + .dsh-tidy-row {
  border-top: 1px solid var(--dsw-alias-border-l3, rgba(128, 128, 128, 0.1));
}

.dsh-tidy-row-info {
  flex: 1;
  min-width: 0;
}

.dsh-tidy-row-title {
  font-size: 13px;
  font-weight: 500;
}

.dsh-tidy-row-desc {
  font-size: 11px;
  color: var(--dsw-alias-label-secondary, rgba(128, 128, 128, 0.7));
  margin-top: 2px;
  line-height: 1.4;
}

/* Switch */
.dsh-tidy-switch {
  position: relative;
  width: 38px;
  height: 22px;
  flex: none;
  cursor: pointer;
  border-radius: 999px;
  border: none;
  background: rgba(128, 128, 128, 0.3);
  transition: background 0.15s ease;
  padding: 0;
  outline: none;
}

.dsh-tidy-switch[aria-checked="true"] {
  background: #3b82f6;
}

.dsh-tidy-switch::after {
  content: "";
  position: absolute;
  top: 2px;
  left: 2px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #ffffff;
  transition: transform 0.15s ease;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
}

.dsh-tidy-switch[aria-checked="true"]::after {
  transform: translateX(16px);
}

/* Inputs */
.dsh-tidy-input-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.dsh-tidy-label {
  font-size: 12px;
  font-weight: 500;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.dsh-tidy-input-row {
  display: flex;
  gap: 8px;
}

.dsh-tidy-input {
  flex: 1;
  min-width: 0;
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.25));
  background: var(--dsw-alias-bg-input, rgba(0, 0, 0, 0.05));
  color: inherit;
  font-size: 12px;
  outline: none;
  transition: border-color 0.15s;
}

.dsh-tidy-input:focus {
  border-color: #3b82f6;
}

.dsh-tidy-btn {
  padding: 6px 14px;
  border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.3));
  background: transparent;
  color: inherit;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
}

.dsh-tidy-btn:hover {
  background: rgba(128, 128, 128, 0.1);
  border-color: rgba(128, 128, 128, 0.5);
}

.dsh-tidy-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.dsh-tidy-badge {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 500;
}

.dsh-tidy-badge-ok {
  background: rgba(34, 197, 94, 0.15);
  color: #22c55e;
}

.dsh-tidy-badge-none {
  background: rgba(156, 163, 175, 0.15);
  color: #9ca3af;
}

.dsh-tidy-badge-warn {
  background: rgba(245, 158, 11, 0.15);
  color: #f59e0b;
}

.dsh-tidy-test-result {
  font-size: 12px;
  margin-left: 10px;
}

.dsh-tidy-test-result.ok {
  color: #22c55e;
}

.dsh-tidy-test-result.fail {
  color: #ef4444;
}

.dsh-tidy-behavior-list {
  padding-left: 18px;
  margin: 4px 0 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

/* Priority list */
.dsh-tidy-priority-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.dsh-tidy-priority-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-radius: 8px;
  background: rgba(128, 128, 128, 0.06);
  border: 1px solid var(--dsw-alias-border-l3, rgba(128, 128, 128, 0.12));
}

.dsh-tidy-priority-name {
  font-size: 12px;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 8px;
}

.dsh-tidy-order-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #3b82f6;
  color: #ffffff;
  font-size: 11px;
  font-weight: 600;
}

.dsh-tidy-btn-group {
  display: flex;
  gap: 4px;
}

.dsh-tidy-icon-btn {
  width: 26px;
  height: 26px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  border: 1px solid rgba(128, 128, 128, 0.2);
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: 12px;
}

.dsh-tidy-icon-btn:hover:not(:disabled) {
  background: rgba(128, 128, 128, 0.15);
}

.dsh-tidy-icon-btn:disabled {
  opacity: 0.3;
  cursor: default;
}

/* Slider / Select */
.dsh-tidy-select {
  padding: 6px 10px;
  border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.3));
  background: var(--dsw-alias-bg-input, rgba(0, 0, 0, 0.05));
  color: inherit;
  font-size: 12px;
  outline: none;
}
`;

// src/client/settings/ui.tsx
var import_jsx_runtime = require("react/jsx-runtime");
var stylesInjected = false;
function ensureSettingsStyles() {
  if (stylesInjected || typeof document === "undefined") return;
  const el = document.createElement("style");
  el.dataset.tidySettings = "true";
  el.textContent = SETTINGS_CSS;
  document.head.appendChild(el);
  stylesInjected = true;
}
function Switch(props) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    "button",
    {
      type: "button",
      className: "dsh-tidy-switch",
      role: "switch",
      "aria-checked": props.checked,
      onClick: props.onChange,
      "aria-label": props.label
    }
  );
}
function TidySettingsPanel() {
  ensureSettingsStyles();
  const [state, setState] = (0, import_react.useState)(() => settingsStore.getState());
  const [testing, setTesting] = (0, import_react.useState)(null);
  const [apiKeyInput, setApiKeyInput] = (0, import_react.useState)("");
  const [savingKey, setSavingKey] = (0, import_react.useState)(false);
  const [keyMsg, setKeyMsg] = (0, import_react.useState)(null);
  (0, import_react.useEffect)(() => {
    return settingsStore.subscribe(() => {
      setState(settingsStore.getState());
    });
  }, []);
  const runTest = async (channel) => {
    setTesting({ channel, running: true });
    const res = await settingsStore.testChannel(channel);
    const message = res.ok ? `\u8FDE\u63A5\u6B63\u5E38\uFF0C\u5EF6\u8FDF ${res.latencyMs}ms` : `\u5931\u8D25\uFF1A${res.error || "\u672A\u77E5\u9519\u8BEF"}`;
    setTesting({ channel, running: false, ok: res.ok, message });
  };
  const handleSaveKey = async () => {
    setSavingKey(true);
    setKeyMsg(null);
    const res = await settingsStore.saveApiKey(apiKeyInput);
    setSavingKey(false);
    if (res.ok) {
      const cleared = !apiKeyInput.trim();
      setKeyMsg({
        ok: true,
        text: cleared ? "\u5DF2\u6E05\u9664 API Key\uFF08AI \u901A\u9053\u5C06\u4E0D\u53EF\u7528\uFF0CBing \u515C\u5E95\uFF09" : "\u5DF2\u4FDD\u5B58\u5230 ~/.dsh/.credentials.yaml\uFF0C\u7ACB\u5373\u751F\u6548"
      });
      setApiKeyInput("");
    } else {
      setKeyMsg({ ok: false, text: `\u4FDD\u5B58\u5931\u8D25\uFF1A${res.error || "\u672A\u77E5\u9519\u8BEF"}` });
    }
  };
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-tidy-settings", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-tidy-card", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-tidy-title", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "\u5DE5\u5177\u8C03\u7528\u4E0E\u601D\u8003\u6458\u8981\u7FFB\u8BD1" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          Switch,
          {
            checked: state.enabled,
            onChange: () => settingsStore.update({ enabled: !state.enabled }),
            label: "\u542F\u7528\u5DE5\u5177\u8C03\u7528\u4E0E\u6458\u8981\u7FFB\u8BD1"
          }
        )
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-tidy-desc", children: [
        "\u81EA\u52A8\u5C06\u5F53\u524D\u4F1A\u8BDD\u4E2D\u5DE5\u5177\u8C03\u7528\u6807\u9898\u4E0E\u601D\u8003\u6298\u53E0\u6458\u8981\uFF08\u5982 ",
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", { children: "Locate DSH home directory structure" }),
        "\uFF09\u7FFB\u8BD1\u4E3A\u4E2D\u6587\uFF0C \u70B9\u51FB\u8BD1\u6587\u53EF\u539F\u5730\u5207\u6362\u539F\u6587/\u8BD1\u6587\u3002\u4EC5\u4F5C\u7528\u4E8E\u5F53\u524D\u67E5\u770B\u7684\u4F1A\u8BDD\uFF0C\u5BF9\u8BDD\u6B63\u6587\u6C38\u4E0D\u7FFB\u8BD1\u3002"
      ] })
    ] }),
    state.enabled && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-tidy-card", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-tidy-title", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "AI \u7FFB\u8BD1\uFF08OpenAI \u517C\u5BB9\u534F\u8BAE\uFF09" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            Switch,
            {
              checked: state.aiEnabled,
              onChange: () => settingsStore.update({ aiEnabled: !state.aiEnabled }),
              label: "\u542F\u7528 AI \u7FFB\u8BD1\u901A\u9053"
            }
          )
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-tidy-desc", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: `dsh-tidy-badge ${state.aiConfigured ? "dsh-tidy-badge-ok" : "dsh-tidy-badge-warn"}`, children: state.aiConfigured ? "\u5DF2\u914D\u7F6E" : "\u672A\u914D\u7F6E" }),
          " ",
          "\u672A\u914D\u7F6E\u65F6 AI \u901A\u9053\u81EA\u52A8\u8DF3\u8FC7\uFF0C\u7531 Bing \u515C\u5E95\u3002"
        ] }),
        state.aiEnabled && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-tidy-row", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-tidy-row-info", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-tidy-row-title", children: "API Key" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-tidy-row-desc", children: [
                "\u4FDD\u5B58\u81F3 ",
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", { children: "~/.dsh/.credentials.yaml" }),
                " \u7684 ",
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", { children: "TRANSLATE_API_KEY" }),
                "\uFF0C\u4FDD\u5B58\u540E\u7ACB\u5373\u751F\u6548\uFF1B\u7559\u7A7A\u4FDD\u5B58 = \u6E05\u9664"
              ] })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-tidy-input-row", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "input",
                {
                  type: "password",
                  className: "dsh-tidy-input",
                  placeholder: state.aiConfigured ? "\u5DF2\u914D\u7F6E\uFF08\u5982\u9700\u66F4\u6362\u8BF7\u76F4\u63A5\u8F93\u5165\uFF09" : "sk-...",
                  value: apiKeyInput,
                  onChange: (e) => setApiKeyInput(e.target.value),
                  style: { width: "260px" },
                  "aria-label": "API Key"
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "dsh-tidy-btn", disabled: savingKey, onClick: handleSaveKey, children: savingKey ? "\u4FDD\u5B58\u4E2D\u2026" : "\u4FDD\u5B58" })
            ] })
          ] }),
          keyMsg && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: `dsh-tidy-test-result ${keyMsg.ok ? "ok" : "fail"}`, children: keyMsg.text }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-tidy-row", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-tidy-row-info", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-tidy-row-title", children: "Base URL" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-tidy-row-desc", children: [
                "\u4EFB\u610F OpenAI \u517C\u5BB9\u670D\u52A1\u7AEF\u70B9\uFF0C\u5982 ",
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", { children: "https://api.openai.com/v1" }),
                "\u3001",
                " ",
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", { children: "https://api.deepseek.com/v1" })
              ] })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "input",
              {
                type: "text",
                className: "dsh-tidy-input",
                placeholder: "https://api.openai.com/v1",
                value: state.baseUrl,
                onChange: (e) => settingsStore.update({ baseUrl: e.target.value }),
                style: { width: "260px" },
                "aria-label": "AI Base URL"
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-tidy-row", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-tidy-row-info", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-tidy-row-title", children: "\u6A21\u578B" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-tidy-row-desc", children: [
                "\u5982 ",
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", { children: "gpt-4o-mini" }),
                "\u3001",
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", { children: "deepseek-chat" }),
                "\uFF1B\u7559\u7A7A\u89C6\u4E3A\u672A\u914D\u7F6E"
              ] })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "input",
              {
                type: "text",
                className: "dsh-tidy-input",
                placeholder: "gpt-4o-mini",
                value: state.model,
                onChange: (e) => settingsStore.update({ model: e.target.value }),
                style: { width: "260px" },
                "aria-label": "AI \u6A21\u578B"
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-tidy-row", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "button",
              {
                type: "button",
                className: "dsh-tidy-btn",
                disabled: testing?.running,
                onClick: () => runTest("openai"),
                children: testing?.running ? "\u6D4B\u8BD5\u4E2D\u2026" : "\u6D4B\u8BD5 AI \u901A\u9053"
              }
            ),
            testing?.channel === "openai" && !testing.running && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: `dsh-tidy-test-result ${testing.ok ? "ok" : "fail"}`, children: testing.message })
          ] })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-tidy-card", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-tidy-title", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Bing \u7F51\u9875\u7FFB\u8BD1\uFF08\u514D Key \u515C\u5E95\uFF09" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            Switch,
            {
              checked: state.bingEnabled,
              onChange: () => settingsStore.update({ bingEnabled: !state.bingEnabled }),
              label: "\u542F\u7528 Bing \u7FFB\u8BD1\u901A\u9053"
            }
          )
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-tidy-desc", children: "\u5185\u7F6E\u514D Key \u7FFB\u8BD1\u901A\u9053\uFF0C\u65E0\u9700\u4EFB\u4F55\u914D\u7F6E\u3002AI \u672A\u914D\u7F6E\u6216\u8BF7\u6C42\u5931\u8D25\u65F6\u81EA\u52A8\u515C\u5E95\uFF1BAI \u4E0E Bing \u540C\u65F6\u5173\u95ED\u5219\u4E0D\u7FFB\u8BD1\u3002" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-tidy-card", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-tidy-row-title", children: "\u901A\u9053\u884C\u4E3A" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("ul", { className: "dsh-tidy-desc dsh-tidy-behavior-list", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: "AI \u5F00\u542F\u4E14\u5DF2\u914D\u7F6E \u2192 AI \u4F18\u5148\u7FFB\u8BD1\uFF0C\u5931\u8D25\u81EA\u52A8\u964D\u7EA7 Bing" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: "AI \u5F00\u542F\u4F46\u672A\u914D\u7F6E + Bing \u5F00\u542F \u2192 \u7531 Bing \u7FFB\u8BD1" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: "AI \u5F00\u542F\u4F46\u672A\u914D\u7F6E + Bing \u5173\u95ED \u2192 \u4E0D\u7FFB\u8BD1" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: "AI \u5173\u95ED + Bing \u5F00\u542F \u2192 \u76F4\u63A5\u4F7F\u7528 Bing" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: "AI \u5173\u95ED + Bing \u5173\u95ED \u2192 \u4E0D\u7FFB\u8BD1" })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-tidy-card", children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-tidy-row", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-tidy-row-info", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-tidy-row-title", children: "\u6700\u5927\u7FFB\u8BD1\u5E76\u53D1\u6570" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-tidy-row-desc", children: "\u63A7\u5236\u89C6\u53E3\u6EDA\u52A8\u4E0E\u591A\u5DE5\u5177\u5361\u7247\u65F6\u7684\u6700\u5927\u5E76\u884C\u8BF7\u6C42\u6570\uFF08\u8303\u56F4 1-100\uFF0C\u63A8\u8350 3\uFF09\u3002" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "input",
          {
            type: "number",
            className: "dsh-tidy-input",
            min: 1,
            max: 100,
            step: 1,
            value: state.concurrency,
            onChange: (e) => {
              const val = parseInt(e.target.value, 10);
              if (!Number.isFinite(val)) return;
              settingsStore.update({ concurrency: Math.min(Math.max(val, 1), 100) });
            },
            style: { width: "88px" },
            "aria-label": "\u6700\u5927\u7FFB\u8BD1\u5E76\u53D1\u6570"
          }
        )
      ] }) })
    ] })
  ] });
}
function setupSettingsUi(ctx) {
  if (typeof window === "undefined") return;
  try {
    const settingsScope = ctx?.settingsScope || (ctx?.get ? ctx.get("settingsScope") : null);
    const remoteCredentials = ctx?.remote?.credentials || (ctx?.get ? ctx.get("remote.credentials") : null);
    if (settingsScope && typeof settingsScope.bind === "function") {
      const scope = settingsScope.bind({ namespace: SETTINGS_NAMESPACE });
      settingsStore.attach(scope, remoteCredentials ?? null);
    }
  } catch (err) {
    console.warn("[dsh-chat-translate] Failed to bind settings scope:", err);
  }
  try {
    const slots = ctx?.slots || (ctx?.get ? ctx.get("slots") : null);
    if (!slots || typeof slots.inject !== "function") return;
    slots.inject("settings.section", () => {
      return slots.register(
        {
          name: "settings.section",
          id: "dsh-chat-translate",
          // 约定：自有插件设置项 order 从 110 起步进 10（原生最大 100=桌面设置），保证排在所有原生项之下
          order: 110,
          label: () => "\u804A\u5929\u7FFB\u8BD1"
        },
        TidySettingsPanel
      );
    });
  } catch (err) {
    console.warn("[dsh-chat-translate] Failed to inject settings section:", err);
  }
}

// src/client/index.ts
var name = "dsh-chat-translate";
var inject = ["slots", "settingsScope", "remote", "remote.credentials"];
function apply(ctx) {
  ctx.effect(() => chatTranslateObserver.start(document), "dsh-chat-translate: title translate observer");
  ctx.effect(() => setupSettingsUi(ctx), "dsh-chat-translate: settings section");
}
return module.exports; } });
//# sourceMappingURL=client.js.map

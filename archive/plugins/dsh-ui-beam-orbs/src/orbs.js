/* ------------------------------------------------------------------ *
 * src/orbs.js — Thinking Orbs 运行时（initOrbs）
 *   工具调用状态映射、DOM 扫描、Orb 画布启动/停止与状态栏文字联动；
 *   几何数学（getOrbPreset 等）在 src/orbs-math.js（工厂级片段）。
 *   由 scripts/build.mjs 拼接进 lib/client.js 的工厂闭包。
 * ------------------------------------------------------------------ */
function initOrbs(shared) {
  var bgSettings = shared.settings;

  var TOOL_STATE_MAP = {
    // 1. Searching (globe 经纬扫描网格球)
    "grep": { state: "searching", text: "Searching files…" },
    "glob": { state: "searching", text: "Finding files…" },
    "web_search": { state: "searching", text: "Searching web…" },
    "find_dsh_plugin": { state: "searching", text: "Searching plugins…" },
    "lsp_symbols": { state: "searching", text: "Finding symbols…" },

    // 2. Listening / Inspecting (wave 声波起伏球)
    "read": { state: "listening", text: "Reading file…" },
    "read_image": { state: "listening", text: "Inspecting image…" },
    "skill": { state: "listening", text: "Loading skill…" },
    "get_goal": { state: "listening", text: "Reading goal…" },
    "web_fetch": { state: "listening", text: "Fetching web page…" },
    "lsp_diagnostics": { state: "listening", text: "Diagnosing code…" },
    "lsp_completion": { state: "listening", text: "Getting completions…" },
    "lsp_signature": { state: "listening", text: "Inspecting signature…" },
    "lsp_inlay_hints": { state: "listening", text: "Reading inlay hints…" },

    // 3. Composing / Writing (ribbon 扭转流光缎带)
    "write": { state: "composing", text: "Writing file…" },
    "edit": { state: "composing", text: "Editing file…" },
    "lsp_format": { state: "composing", text: "Formatting file…" },
    "lsp_rename": { state: "composing", text: "Renaming symbol…" },
    "lsp_code_action": { state: "composing", text: "Applying code action…" },

    // 4. Solving / Commands (rubik 旋转魔方立方矩阵)
    "bash": { state: "solving", text: "Running command…" },
    "run_code": { state: "solving", text: "Running code…" },

    // 5. Connecting / Subagents (web 动态网络拓扑 / 神经节点)
    "subagent": { state: "connecting", text: "Connecting subagent…" },
    "subagent_fork": { state: "connecting", text: "Delegating task…" },
    "workflow": { state: "connecting", text: "Running workflow…" },
    "ralph": { state: "connecting", text: "Running Ralph…" },
    "send_message": { state: "connecting", text: "Sending message…" },
    "interrupt_agent": { state: "connecting", text: "Interrupting agent…" },
    "list_agents": { state: "connecting", text: "Listing agents…" },
    "job_output": { state: "connecting", text: "Checking job output…" },
    "job_list": { state: "connecting", text: "Listing jobs…" },
    "job_kill": { state: "connecting", text: "Stopping job…" },

    // 6. Shaping / Tasks & Goals (morph 几何变形多面体)
    "todo_write": { state: "shaping", text: "Updating tasks…" },
    "create_goal": { state: "shaping", text: "Creating goal…" },
    "update_goal": { state: "shaping", text: "Updating goal…" },
    "exit_plan_mode": { state: "shaping", text: "Finalizing plan…" },

    // 7. Weaving / Cordis plugins (braid 编织双螺旋)
    "cordis_define": { state: "weaving", text: "Weaving plugin…" },
    "cordis_run": { state: "weaving", text: "Activating plugin…" },
    "cordis_stop": { state: "weaving", text: "Stopping plugin…" },
    "cordis_undefine": { state: "weaving", text: "Removing plugin…" },
    "cordis_inspect_list": { state: "weaving", text: "Inspecting runtime…" },
    "cordis_inspect_query": { state: "weaving", text: "Querying runtime…" },
    "cordis_inspect_self": { state: "weaving", text: "Inspecting plugin…" },

    // 8. Breathing / Interactive questions (ring 光晕呼吸环)
    "ask_user_question": { state: "breathing", text: "Asking question…" }
  };

  function truncateStr(str, maxLen) {
    if (!str || typeof str !== "string") return "";
    str = str.trim();
    if (str.length <= maxLen) return str;
    return str.slice(0, maxLen - 1) + "…";
  }

  // 保留扩展名的截断：超长时 head + "…" + ext（ext 为最后一个 '.' 之后部分；
  // '.' 不存在或位于首字符时退化为普通截断）。替代裸截断，保住 ".ts" 等扩展名可读性。
  function truncateKeepExt(str, max) {
    if (!str || typeof str !== "string") return "";
    str = str.trim();
    if (str.length <= max) return str;
    var dotIdx = str.lastIndexOf(".");
    if (dotIdx <= 0) return truncateStr(str, max);
    var ext = str.slice(dotIdx);
    var headLen = max - ext.length - 1;
    if (headLen < 1) return truncateStr(str, max); // 扩展名本身过长时退化为普通截断
    return str.slice(0, headLen) + "…" + ext;
  }

  // 可见性判断（替代 offsetParent 强制重排）：优先 checkVisibility，
  // 回退 hidden 属性检查，杜绝流式输出期间每 50ms 扫描触发的 Forced Sync Layout。
  function isVisible(el) {
    if (!el) return false;
    try {
      if (typeof el.checkVisibility === "function") return !!el.checkVisibility();
    } catch(e) {}
    try {
      if (el.hasAttribute) return !el.hasAttribute("hidden");
    } catch(e) {}
    return true;
  }

  function extractSummaryDetail(el, toolName) {
    try {
      if (!el) return null;
      // 1. 文件链接类（read, write, edit, lsp_*）
      var fileBtn = el.querySelector('button[class*="fileLink"], .o3BgMG_fileLink, [data-file-link]');
      if (fileBtn && fileBtn.textContent) {
        var rawPath = fileBtn.textContent.trim();
        rawPath = rawPath.replace(/[\/\\]+$/, ""); // 先去尾斜杠再分段，避免产生空末段
        var pathSegs = rawPath.split(/[/\\]/);
        var fn = pathSegs.pop() || "";
        var dirFallback = false;
        if (fn === "" && pathSegs.length > 0) {
          // 末段为空（路径以分隔符结尾）：回退取倒数第二段并在文案前标注目录
          fn = pathSegs.pop() || "";
          dirFallback = true;
        }
        if (fn) {
          var shortFn = truncateKeepExt(fn, 26);
          if (dirFallback) shortFn = "dir " + shortFn;
          if (toolName === "read") return "Reading " + shortFn;
          if (toolName === "write") return "Writing " + shortFn;
          if (toolName === "edit") return "Editing " + shortFn;
          if (toolName.indexOf("lsp_") === 0) return "LSP: " + shortFn;
          return toolName + ": " + shortFn;
        }
      }

      // 2. 通用摘要类（grep, glob, bash, skill, web_search, subagent, etc.）
      var sumEl = el.querySelector('[class*="summary"]:not([class*="error"]), .o3BgMG_summary, .CY-8Ka_summary, .iWrAna_summary, [class*="title"]');
      if (sumEl && sumEl.textContent) {
        var txt = sumEl.textContent.trim();
        if (txt.length > 0) {
          if (toolName === "grep") return "Searching: " + truncateKeepExt(txt, 26);
          if (toolName === "glob") return "Finding: " + truncateKeepExt(txt, 26);
          if (toolName === "bash") {
            // 先剥离前置环境变量赋值（如 FOO=bar BAZ="x y" ），再剥 bash -c 包装
            var cmd = txt.replace(/^([A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|\S+)\s+)+/, "").replace(/^bash\s*(-c\s*)?/i, "").replace(/^["']|["']$/g, "");
            return "Running: " + truncateKeepExt(cmd, 26);
          }
          if (toolName === "run_code") return "Running: " + truncateKeepExt(txt, 26);
          if (toolName === "skill") return "Skill: " + truncateKeepExt(txt, 26);
          if (toolName === "web_search") return "Web: " + truncateKeepExt(txt, 26);
          if (toolName === "web_fetch") return "Fetching: " + truncateKeepExt(txt, 26);
          if (toolName === "find_dsh_plugin") return "Plugin: " + truncateKeepExt(txt, 26);
          if (toolName === "subagent" || toolName === "subagent_fork") return "Subagent: " + truncateStr(txt, 24);
          if (toolName === "workflow") return "Workflow: " + truncateStr(txt, 24);
          if (toolName === "ralph") return "Ralph: " + truncateStr(txt, 24);
          if (toolName === "todo_write") return "Tasks: " + truncateStr(txt, 24);
          if (toolName.indexOf("cordis_") === 0) return "Plugin: " + truncateStr(txt, 24);
          if (toolName.indexOf("lsp_") === 0) return "LSP: " + truncateStr(txt, 24);
          if (toolName.indexOf("browser_") === 0) return "Browser: " + truncateStr(txt, 24);
          return truncateStr(txt, 28);
        }
      }
    } catch(e) {}
    return null;
  }

  // —— 新调度：最小可视时长 + 等待态 + 队列，避免快工具被跳过 —— //
  var lastActiveToolRecord = {
    state: null,
    text: null,
    tool: null,
    timestamp: 0
  };
  var MIN_TOOL_DWELL_MS = 600;
  var WAITING_WINDOW_MS = 1200;       // 工具结束后的统一 Waiting 时间窗（0 ~ 1200ms）
  var RESPONDING_FALLBACK_MS = 1500;  // 未命中答案流节点时，距最后工具记录超过该时长即判定正文流式输出
  var QUEUE_TTL_MS = 2500;            // 队列项存活时长，超期丢弃防旧任务幽灵回放
  var WAITING_TEXT = "Waiting…";
  var RESPONDING_TEXT = "Responding…";
  var RESPONDING_FALLBACK_MAX_MS = 20000; // 无流标记模型长思考的兜底上限：超时回退 Thinking…
  var displayInfo = null;
  var displaySince = 0;
  var toolQueue = [];
  var prevExecuting = false;          // 上一轮 isExecuting 快照：用于识别“新一轮执行开始”

  // 非具体工具的生命周期态（waiting/thinking 等）：与它们切换时不受最小可视时长扣住，
  // 否则幽灵 Thinking 会借 dwell 多停留一拍形成双重闪烁
  function isGenericToolKey(toolKey) {
    return toolKey === "waiting" || toolKey === "thinking" || toolKey === "idle" ||
           toolKey === "fallback" || toolKey === "responding" ||
           toolKey === "reasoning" || toolKey === "plan" ||
           toolKey === "ask_user_question" || toolKey === "exit_plan_mode";
  }

  // 交互卡片（用户提问 / 计划审核）存在性检测：结果缓存 200ms 防抖。
  // 存在时小球启动门控放行、空闲清理跳过，保证 breathing/shaping 动效在交互阶段持续可见。
  var interactiveCardCache = { ts: 0, hit: false };
  function hasInteractiveCard() {
    var nowMs = Date.now();
    if (nowMs - interactiveCardCache.ts < 200) return interactiveCardCache.hit;
    interactiveCardCache.ts = nowMs;
    interactiveCardCache.hit = false;
    try {
      var qEl = document.querySelector('.Mbwy4a_card, [class*="QuestionComposer"]');
      if (qEl && isVisible(qEl)) interactiveCardCache.hit = true;
    } catch(e) {}
    if (!interactiveCardCache.hit) {
      try {
        var pEl = document.querySelector('.LVzXQa_card, [class*="PlanReviewPanel"]');
        if (pEl && isVisible(pEl)) interactiveCardCache.hit = true;
      } catch(e) {}
    }
    return interactiveCardCache.hit;
  }

  // 正文流式输出（答案流节点）探测：候选选择器逐个匹配，整体 try/catch 包裹
  function detectRespondingStream() {
    try {
      var sels = [
        '[data-variant="answer"][data-state="running"]',
        '[data-role="assistant"][data-streaming="true"]'
      ];
      for (var si = 0; si < sels.length; si++) {
        var el = document.querySelector(sels[si]);
        if (el && isVisible(el)) return true;
      }
    } catch(e) {}
    return false;
  }

  function rawDetect() {
    try {
      // Tier 1: 优先检测当前处于 running 状态的工具调用行 / 命令 / 子分派
      var runningRows = document.querySelectorAll('[data-tool][data-state="running"], [data-sample="bash"][data-state="running"], [data-subcalls] [data-tool][data-state="running"], .CY-8Ka_root[data-state="running"], .o3BgMG_root[data-state="running"], .iWrAna_card[data-state="running"], .ztWv_q_subCalls [data-tool][data-state="running"]');
      if (runningRows && runningRows.length > 0) {
        // 并发工具数：剔除“祖先已在集合内”的行（run_code 父行与其 running 子调用并存时
        // 父子会同时命中并集选择器），避免 N 双计产生 “Running 4 tools… (3 tools)” 式双重文案
        var concurrentN = 0;
        for (var ci = 0; ci < runningRows.length; ci++) {
          var nested = false;
          for (var cj = 0; cj < runningRows.length; cj++) {
            if (cj === ci) continue;
            try {
              if (runningRows[cj].getAttribute("data-tool") && runningRows[cj].contains(runningRows[ci])) { nested = true; break; }
            } catch(_ce) {}
          }
          if (!nested) concurrentN++;
        }
        for (var i = runningRows.length - 1; i >= 0; i--) {
          var row = runningRows[i];
          if (row.classList && (row.classList.contains("EvIC1a_turnStatus") || row.classList.contains("dsh-turn-status-text"))) continue;
          var tool = row.getAttribute("data-tool");
          if (!tool && (row.classList.contains("CY-8Ka_root") || row.closest(".CY-8Ka_card") || row.getAttribute("data-sample") === "bash")) {
            tool = "bash";
          }
          if (!tool && (row.classList.contains("iWrAna_card") || row.closest(".iWrAna_card"))) {
            tool = "skill";
          }
          if (!tool) {
            var parent = row.closest("[data-tool]");
            if (parent) tool = parent.getAttribute("data-tool");
          }
          var subK = 0;
          if (tool === "run_code") {
            // 子调用并发：querySelectorAll 取全部 running 子调用，末位作为 state 映射来源
            var subCallList = null;
            try {
              subCallList = row.querySelectorAll('[data-subcalls] [data-tool][data-state="running"], .ztWv_q_subCalls [data-tool][data-state="running"]');
            } catch(_se) { subCallList = null; }
            if (subCallList && subCallList.length > 0) {
              var subCallRunning = subCallList[subCallList.length - 1];
              var subTool = subCallRunning.getAttribute("data-tool");
              if (subTool) {
                row = subCallRunning;
                tool = subTool;
                subK = subCallList.length;
              }
            }
          }
          if (tool) {
            var mapped = TOOL_STATE_MAP[tool];
            var stateKey = mapped ? mapped.state : (
              tool.indexOf("cordis_") === 0 ? "weaving" :
              tool.indexOf("subagent") === 0 ? "connecting" :
              tool.indexOf("lsp_") === 0 ? "listening" :
              tool.indexOf("browser_") === 0 ? "solving" :
              tool.indexOf("read") === 0 ? "listening" : "composing"
            );
            var defaultTxt = mapped ? mapped.text : (tool + "…");
            var customDetail = extractSummaryDetail(row, tool);
            var resolvedText;
            if (concurrentN > 1) {
              // 并发聚合：多个工具同时 running 时合并为一条计数文案（state 仍取倒序第一个映射）
              resolvedText = "Running " + concurrentN + " tools…";
            } else {
              resolvedText = customDetail || defaultTxt;
            }
            if (subK > 1) resolvedText += " (" + subK + " tools)";
            return {
              state: stateKey,
              text: resolvedText,
              tool: tool
            };
          }
        }
      }

      // Tier 2: 活跃的思考/推理流 (Reasoning Stream) — 纯 Thinking，不拼接具体摘要
      var reasoningEl = document.querySelector('[data-variant="think"][data-state="running"]');
      if (reasoningEl && isVisible(reasoningEl)) {
        var thinkText = "Thinking…";
        return { state: "composing", text: thinkText, tool: "reasoning" };
      }

      // Tier 3: 用户提问与计划待审交互卡片
      var questionEl = document.querySelector('.Mbwy4a_card, [class*="QuestionComposer"]');
      if (questionEl && isVisible(questionEl)) {
        return { state: "breathing", text: "Asking question…", tool: "ask_user_question" };
      }
      var planReviewEl = document.querySelector('.LVzXQa_card, [class*="PlanReviewPanel"]');
      if (planReviewEl && isVisible(planReviewEl)) {
        return { state: "shaping", text: "Reviewing plan…", tool: "exit_plan_mode" };
      }

      // Tier 5: 活跃 Todo 项追踪（仅 executing 时）
      var executing = shared.refs.isExecuting ? shared.refs.isExecuting() : false;
      if (executing) {
        var activeTodoEl = document.querySelector('[data-testid="todo-panel"] [data-status="in_progress"], [data-slot="conversation.input.dock"] [data-status="in_progress"], [class*="todo"] [data-status="in_progress"]');
        if (activeTodoEl && activeTodoEl.textContent) {
          var todoContent = activeTodoEl.textContent.trim();
          if (todoContent.length > 0) {
            return { state: "shaping", text: "Task: " + truncateStr(todoContent, 24), tool: "todo_write" };
          }
        }
      }
    } catch(e) {}
    return null;
  }

  function resolveActiveToolState() {
    try {
      var executing = shared.refs.isExecuting ? shared.refs.isExecuting() : false;
      var now = Date.now();

      // 新一轮执行开始的检测已移至 syncThinkingOrb：renderOrb 心跳在 Stop 时已死，
      // 快照在此更新存在观测盲区（Stop 后 executing=false 永不被观测，prevExecuting 卡死，
      // 上轮 record 会泄漏进新轮并误显 Responding）

      var candidate = rawDetect();

      if (candidate) {
        lastActiveToolRecord.state = candidate.state;
        lastActiveToolRecord.text = candidate.text;
        lastActiveToolRecord.tool = candidate.tool;
        lastActiveToolRecord.timestamp = now;

        if (!displayInfo) {
          displayInfo = candidate;
          displaySince = now;
          return candidate;
        }
        if (displayInfo.tool === candidate.tool && displayInfo.text === candidate.text && displayInfo.state === candidate.state) {
          displayInfo = candidate;
          return candidate;
        }
        if (now - displaySince < MIN_TOOL_DWELL_MS) {
          var alreadyQueued = false;
          for (var qi = 0; qi < toolQueue.length; qi++) {
            // tool+text 双字段都匹配才视为同一队列项（修复同名工具不同文案被静默覆写）
            if (toolQueue[qi].tool === candidate.tool && toolQueue[qi].text === candidate.text) { alreadyQueued = true; break; }
          }
          if (!alreadyQueued) {
            if (toolQueue.length < 8) toolQueue.push({ state: candidate.state, text: candidate.text, tool: candidate.tool, queuedAt: now });
            else toolQueue[toolQueue.length - 1] = { state: candidate.state, text: candidate.text, tool: candidate.tool, queuedAt: now };
          } else {
            for (var qj = 0; qj < toolQueue.length; qj++) {
              if (toolQueue[qj].tool === candidate.tool && toolQueue[qj].text === candidate.text) {
                toolQueue[qj] = { state: candidate.state, text: candidate.text, tool: candidate.tool, queuedAt: now };
              }
            }
          }
          return displayInfo;
        } else {
          displayInfo = candidate;
          displaySince = now;
          return candidate;
        }
      }

      // 无候选：优先消化队列（保证快工具至少露面一次）；超期(TTL)项循环 shift 丢弃，防旧任务幽灵回放。
      // 仅在回合仍活跃（executing 或交互卡片在场）时消化：Stop 后残余未过期项直接进入下方清理，不再回放
      if (toolQueue.length > 0 && (executing || hasInteractiveCard()) &&
          (!displayInfo || now - displaySince >= MIN_TOOL_DWELL_MS)) {
        var next = null;
        while (toolQueue.length > 0) {
          var head = toolQueue.shift();
          if (head && typeof head.queuedAt === "number" && now - head.queuedAt <= QUEUE_TTL_MS) { next = head; break; }
        }
        if (next) {
          displayInfo = next;
          displaySince = now;
          lastActiveToolRecord.state = next.state;
          lastActiveToolRecord.text = next.text;
          lastActiveToolRecord.tool = next.tool;
          lastActiveToolRecord.timestamp = now;
          return next;
        }
      }

      // 非执行态（Stop/取消/回合结束）：立即清空队列与展示，快速前进不留 600ms 旧状态残留，
      // 下一轮启动无旧态闪烁；存在交互卡片（提问呼吸环 / 计划审核 shaping）时跳过清理保证动效可见
      if (!executing) {
        if (!hasInteractiveCard()) {
          toolQueue = [];
          displayInfo = null;
          displaySince = 0;
        }
        if (shared.refs.isPlanMode && shared.refs.isPlanMode()) {
          var planIdle = { state: "composing", text: "Planning…", tool: "plan" };
          displayInfo = planIdle;
          displaySince = now;
          return planIdle;
        }
        // 空闲态不再误显示 Thinking，返回 idle 标记（由 syncThinkingOrb 隐藏）
        var idleInfo = { state: "composing", text: "Thinking…", tool: "idle" };
        return idleInfo;
      }

      // 若当前展示仍在最小可视期内，保持（仅 executing 时会走到这里）。
      // 但非具体工具的生命周期态（thinking/waiting 等）不被扣住，
      // 让统一等待窗 / 正文流式输出立即接管，消除幽灵 Thinking 双重闪烁
      if (displayInfo && now - displaySince < MIN_TOOL_DWELL_MS && !isGenericToolKey(displayInfo.tool)) {
        return displayInfo;
      }

      // executing === true 但无候选：区分 工具间隙(Waiting) / 正文流式输出(Responding) / LLM 思考(Thinking)
      var age = lastActiveToolRecord.timestamp ? (now - lastActiveToolRecord.timestamp) : 99999;
      var isRecentTool = lastActiveToolRecord.tool && lastActiveToolRecord.tool !== "reasoning" && lastActiveToolRecord.tool !== "ask_user_question" && lastActiveToolRecord.tool !== "plan" && lastActiveToolRecord.tool !== "idle" && lastActiveToolRecord.tool !== "waiting" && lastActiveToolRecord.tool !== "thinking" && lastActiveToolRecord.tool !== "responding";

      // 1) 统一等待窗：工具结束 0 ~ 1200ms 内稳定显示 Waiting…（去掉原下界，
      //    修复时间窗倒置导致 0~300ms 与 >1200ms 穿透为幽灵 Thinking 的双重闪烁）
      if (isRecentTool && age < WAITING_WINDOW_MS) {
        var waitingInfo = { state: "working", text: WAITING_TEXT, tool: "waiting" };
        if (!displayInfo || displayInfo.tool !== "waiting") {
          // 从 thinking/waiting 等非具体工具态切来时，不被最小可视时长扣住
          if (!(displayInfo && isGenericToolKey(displayInfo.tool)) && displayInfo && now - displaySince < MIN_TOOL_DWELL_MS) return displayInfo;
          displayInfo = waitingInfo;
          displaySince = now;
        }
        return waitingInfo;
      }

      var planModeNow = shared.refs.isPlanMode ? shared.refs.isPlanMode() : false;

      // 2) Responding：答案流节点探测仅在执行中且非 Plan 时参与——历史答案块常驻可见，
      //    不做门控会以陈旧节点顶掉 Planning；未命中但距最后工具记录 1.5s~20s 且非 Plan，
      //    判定为正文流式输出；超 20s 无正向流证据回退 Thinking（无流标记模型的长思考不再永久误标）
      if ((executing && !planModeNow && detectRespondingStream()) ||
          (isRecentTool && age >= RESPONDING_FALLBACK_MS && age <= RESPONDING_FALLBACK_MAX_MS && !planModeNow)) {
        var respondingInfo = { state: "composing", text: RESPONDING_TEXT, tool: "responding" };
        if (!displayInfo || displayInfo.tool !== "responding") {
          if (!(displayInfo && isGenericToolKey(displayInfo.tool)) && displayInfo && now - displaySince < MIN_TOOL_DWELL_MS) return displayInfo;
          displayInfo = respondingInfo;
          displaySince = now;
        }
        return respondingInfo;
      }

      // 3) 真正的 LLM 思考或 Plan 模式
      if (planModeNow) {
        var planInfo2 = { state: "composing", text: "Planning…", tool: "plan" };
        if (!displayInfo || displayInfo.tool !== "plan") {
          if (!(displayInfo && isGenericToolKey(displayInfo.tool)) && displayInfo && now - displaySince < MIN_TOOL_DWELL_MS) return displayInfo;
          displayInfo = planInfo2;
          displaySince = now;
        }
        return planInfo2;
      }

      // 4) 过渡空档（等待窗结束 ~ Responding 兜底线之间且未命中答案流节点）：保持当前展示，避免来回跳变。
      //    age 超过 RESPONDING_FALLBACK_MAX_MS 后不再保持，落至分支 5 回退 Thinking…（上限真正闭合）
      if (isRecentTool && displayInfo && age <= RESPONDING_FALLBACK_MAX_MS) {
        return displayInfo;
      }

      // 5) Thinking 兜底：仅保留给本轮尚未出现任何工具记录之时（reasoning 流活跃时已在上方以候选形式返回）
      var thinkInfo = { state: "composing", text: "Thinking…", tool: "thinking" };
      if (!displayInfo || displayInfo.tool !== "thinking") {
        if (!(displayInfo && isGenericToolKey(displayInfo.tool)) && displayInfo && now - displaySince < MIN_TOOL_DWELL_MS) return displayInfo;
        displayInfo = thinkInfo;
        displaySince = now;
      }
      return thinkInfo;
    } catch(e) {
      return { state: "composing", text: "Thinking…", tool: "fallback" };
    }
  }

  var orbCanvas = null;
  var orbCtx = null;
  var orbRaf = 0;
  var orbMountedStatusEl = null;
  var orbActive = false;
  var orbCurrentState = "composing";
  var orbStartTime = 0;
  var orbTextSpan = null;
  var orbReduceTimer = null;            // prefers-reduced-motion 降级绘制定时器
  var REDUCED_MOTION_INTERVAL_MS = 400; // 降级模式下的手绘帧间隔
  var srAnnounceEl = null;              // 持久屏幕阅读器播报节点

  // 无障碍：向 document.body 追加一个视觉隐藏、SR 可见的持久播报节点（幂等）
  function ensureSrAnnouncer() {
    if (srAnnounceEl && document.contains(srAnnounceEl)) return srAnnounceEl;
    try {
      srAnnounceEl = document.createElement("span");
      srAnnounceEl.setAttribute("aria-live", "polite");
      srAnnounceEl.setAttribute("role", "status");
      srAnnounceEl.setAttribute("data-dsh-sr-announcer", ""); // 防止被 statusEl 兜底选择器自匹配
      // 内联样式实现屏幕阅读器可见的视觉隐藏（sr-only 裁剪法）
      srAnnounceEl.style.position = "absolute";
      srAnnounceEl.style.width = "1px";
      srAnnounceEl.style.height = "1px";
      srAnnounceEl.style.margin = "-1px";
      srAnnounceEl.style.overflow = "hidden";
      srAnnounceEl.style.clip = "rect(0 0 0 0)";
      srAnnounceEl.style.whiteSpace = "nowrap";
      document.body.appendChild(srAnnounceEl);
    } catch(e) { srAnnounceEl = null; }
    return srAnnounceEl;
  }

  // 状态文案变化时同步到 SR 播报节点
  function announceSrStatus(text) {
    var ann = ensureSrAnnouncer();
    if (ann && ann.textContent !== text) {
      try { ann.textContent = text; } catch(e) {}
    }
  }

  function syncTurnStatusText(statusEl, text) {
    if (!statusEl || !document.contains(statusEl)) return;
    try {
      var isDark = shared.refs.getBeamThemeIsDark ? shared.refs.getBeamThemeIsDark() : false;
      if (!isDark) {
        // 浅色主题：不注入状态文字（保留官方原版状态文本），清理已注入的 span 与朗读抑制标记
        if (orbTextSpan && statusEl.contains(orbTextSpan)) {
          try { statusEl.removeChild(orbTextSpan); } catch(e){}
          orbTextSpan = null;
        }
        try { if (statusEl.getAttribute("aria-hidden")) statusEl.removeAttribute("aria-hidden"); } catch(e){}
        return;
      }
      if (!orbTextSpan || !statusEl.contains(orbTextSpan)) {
        var existing = statusEl.querySelector(".dsh-turn-status-text");
        if (existing) {
          orbTextSpan = existing;
        } else {
          orbTextSpan = document.createElement("span");
          orbTextSpan.className = "dsh-turn-status-text";
          var clockEl = statusEl.querySelector(".EvIC1a_turnStatusClock, [class*='turnStatusClock']");
          if (clockEl) {
            statusEl.insertBefore(orbTextSpan, clockEl);
          } else {
            statusEl.appendChild(orbTextSpan);
          }
        }
      }
      if (orbTextSpan && orbTextSpan.textContent !== text) {
        orbTextSpan.textContent = text;
        announceSrStatus(text); // 同步屏幕阅读器播报（statusEl 已 aria-hidden，避免双读）
      }
    } catch(e) {}
  }

  function createThinkingOrbCanvas() {
    var wrap = document.createElement("span");
    wrap.className = "dsh-thinking-orb-wrap";
    wrap.setAttribute("aria-hidden", "true");
    var cvs = document.createElement("canvas");
    cvs.className = "dsh-thinking-orb-canvas";
    var size = 20;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    cvs.width = size * dpr;
    cvs.height = size * dpr;
    cvs.style.width = size + "px";
    cvs.style.height = size + "px";
    wrap.appendChild(cvs);
    return { wrap: wrap, canvas: cvs };
  }

  function startThinkingOrb(targetEl) {
    if (!targetEl || !document.contains(targetEl)) return;
    // 浅色主题门控：彻底不挂 Canvas 不跑 rAF，与插件的深色门控哲学一致
    var themeDark = shared.refs.getBeamThemeIsDark ? shared.refs.getBeamThemeIsDark() : false;
    if (!themeDark) {
      if (orbActive) stopThinkingOrb();
      return;
    }
    if (targetEl === srAnnounceEl) return; // 绝不把 orb 挂进隐形播报节点
    if (orbMountedStatusEl === targetEl && orbCanvas && targetEl.contains(orbCanvas.parentNode)) {
      return;
    }
    stopThinkingOrb();

    // prefers-reduced-motion：降级为低频手绘帧 + 整体减速（仍走同一渲染函数）
    var reducedMotion = !!(shared.media && shared.media.reducedMotion);
    var orb = createThinkingOrbCanvas();
    orbCanvas = orb.canvas;
    orbCtx = orbCanvas.getContext("2d");
    orbMountedStatusEl = targetEl;
    targetEl.insertBefore(orb.wrap, targetEl.firstChild);
    // 无障碍：抑制官方原生文本与注入文本的双重朗读，并标记忙碌态（结束移除 aria-busy）
    try { targetEl.setAttribute("aria-hidden", "true"); } catch(e) {}
    try { targetEl.setAttribute("aria-busy", "true"); } catch(e) {}
    ensureSrAnnouncer();
    orbActive = true;
    orbStartTime = performance.now();
    var orbLastScan = 0;
    var orbLastInfo = null;
    var orbLastFrameTs = 0;

    function renderOrb(now) {
      if (!orbActive || !orbCtx || !orbMountedStatusEl || !document.contains(orbMountedStatusEl)) {
        stopThinkingOrb();
        return;
      }
      // 调度：常规走 rAF；reduced-motion 下由外部定时器驱动本函数，不再自续 rAF
      if (!reducedMotion) {
        orbRaf = requestAnimationFrame(renderOrb);
      }

      if (document.visibilityState === "hidden") return;

      // 大帧间隔保护（后台切回）：平移动画起点使 elapsed 连续，消除粒子瞬移
      if (!reducedMotion && orbLastFrameTs && now - orbLastFrameTs > 250) {
        orbStartTime += now - orbLastFrameTs;
      }
      orbLastFrameTs = now;

      if (now - orbLastScan >= 50 || !orbLastInfo) {
        orbLastScan = now;
        orbLastInfo = resolveActiveToolState();
      }
      var activeInfo = orbLastInfo;
      orbCurrentState = activeInfo.state;

      var isPlan = (shared.refs.isPlanMode && shared.refs.isPlanMode()) || activeInfo.tool === "plan" || (activeInfo.state === "breathing" && shared.refs.isPlanMode && shared.refs.isPlanMode());
      if (orb.wrap) {
        if (orb.wrap.getAttribute("data-state") !== activeInfo.state) {
          orb.wrap.setAttribute("data-state", activeInfo.state);
        }
        if (isPlan) {
          orb.wrap.setAttribute("data-planning", "true");
        } else {
          orb.wrap.removeAttribute("data-planning");
        }
        if (activeInfo.tool === "waiting") {
          orb.wrap.setAttribute("data-waiting", "true");
        } else {
          orb.wrap.removeAttribute("data-waiting");
        }
      }

      syncTurnStatusText(orbMountedStatusEl, activeInfo.text);

      var size = 20;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      // DPR 一致性：跨屏拖拽/缩放后 devicePixelRatio 变化时重建画布尺寸与 transform，
      // 修复渲染裁切畸变
      var targetPx = Math.round(size * dpr);
      if (orbCanvas.width !== targetPx) {
        orbCanvas.width = targetPx;
        orbCanvas.height = targetPx;
      }
      var preset = getOrbPreset(activeInfo.state, 20);
      var renderFn = cp[preset.mode] || cp.orbits;
      var speedMul = reducedMotion ? 0.2 : 1;

      var elapsed = (now - orbStartTime) * 0.001 * preset.speed * speedMul;
      if (activeInfo.tool === "waiting") elapsed *= 0.62;
      var res = renderFn(size, elapsed, preset.opts);

      var isDark = shared.refs.getBeamThemeIsDark ? shared.refs.getBeamThemeIsDark() : false;
      orbCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      orbCtx.clearRect(0, 0, size, size);
      Xd(orbCtx, res, isDark);
    }

    if (reducedMotion) {
      // 降级路径：每 400ms 手动绘制一帧（同一渲染函数），不占用 rAF
      orbReduceTimer = setInterval(function() {
        try { renderOrb(performance.now()); } catch(e) {}
      }, REDUCED_MOTION_INTERVAL_MS);
    } else {
      orbRaf = requestAnimationFrame(renderOrb);
    }
  }

  function stopThinkingOrb() {
    orbActive = false;
    if (orbRaf) {
      cancelAnimationFrame(orbRaf);
      orbRaf = 0;
    }
    if (orbReduceTimer) {
      try { clearInterval(orbReduceTimer); } catch(e) {}
      orbReduceTimer = null;
    }
    if (orbTextSpan && orbTextSpan.parentNode) {
      try { orbTextSpan.parentNode.removeChild(orbTextSpan); } catch(e) {} // 注入文字随结束移除，避免陈旧文案残留
    }
    if (orbMountedStatusEl) {
      // 忙碌与朗读抑制标记一并移除：官方原生文本恢复可读可播报（注入 span 已删，无双读）
      try { orbMountedStatusEl.removeAttribute("aria-busy"); } catch(e) {}
      try { orbMountedStatusEl.removeAttribute("aria-hidden"); } catch(e) {}
    }
    if (orbCanvas && orbCanvas.parentNode) {
      try { orbCanvas.parentNode.remove(); } catch(e) {}
    }
    orbCanvas = null;
    orbCtx = null;
    orbMountedStatusEl = null;
    orbTextSpan = null;
  }

  function syncThinkingOrb() {
    // 新一轮执行开始检测（由 400ms 轮询 + 合批订阅驱动，Stop 后必被观测）：
    // 重置上轮工具记录/队列/展示，确保 “Thinking…” 只出现在本轮尚无工具记录的阶段，
    // 同时杜绝上轮残留借 dwell 闪入新轮（≤600ms 残闪）
    var executingNow = shared.refs.isExecuting ? shared.refs.isExecuting() : false;
    if (executingNow && !prevExecuting) {
      lastActiveToolRecord.state = null;
      lastActiveToolRecord.text = null;
      lastActiveToolRecord.tool = null;
      lastActiveToolRecord.timestamp = 0;
      toolQueue = [];
      displayInfo = null;
      displaySince = 0;
    }
    prevExecuting = executingNow;
    if (!bgSettings || bgSettings.orbs === false) {
      if (orbActive) stopThinkingOrb();
      if (orbMutObs || orbPollTimer) { try { detachThinkingOrbs(); } catch(e) {} }
      return;
    }
    var statusEl = document.querySelector(".EvIC1a_turnStatus, [role=\"status\"][aria-live=\"polite\"]:not([data-dsh-sr-announcer])");
    var executing = shared.refs.isExecuting ? shared.refs.isExecuting() : false;
    // 启动门控扩展：存在交互卡片（提问呼吸环 / 计划审核 shaping）时同样保持小球，
    // 修复用户交互阶段小球蒸发的问题
    if (statusEl && (executing || hasInteractiveCard())) {
      startThinkingOrb(statusEl);
    } else {
      if (orbActive) stopThinkingOrb();
      if (!executing && !hasInteractiveCard()) {
        // 空闲时清空队列与展示，避免下次执行时残留旧状态（存在交互卡片时跳过清理）
        toolQueue = [];
        if (displayInfo) {
          displayInfo = null;
          displaySince = 0;
        }
      }
    }
  }

  var orbMutObs = null;
  var orbCoalesceUnsub = null;
  var orbPollTimer = null;
  function detachThinkingOrbs() {
    if (orbPollTimer) { try { clearInterval(orbPollTimer); } catch(e) {} orbPollTimer = null; }
    if (orbCoalesceUnsub) { try { orbCoalesceUnsub(); } catch(e) {} orbCoalesceUnsub = null; }
    if (orbMutObs) { try { orbMutObs.disconnect(); } catch(e) {} orbMutObs = null; }
    if (orbActive) try { stopThinkingOrb(); } catch(e) {}
  }
  function watchThinkingOrbs() {
    if (!bgSettings || bgSettings.orbs === false) { detachThinkingOrbs(); return; }
    if (orbPollTimer) clearInterval(orbPollTimer);
    orbPollTimer = setInterval(function() {
      try { syncThinkingOrb(); } catch(e) {}
    }, 400);

    if (orbCoalesceUnsub || orbMutObs) return;
    if (shared.refs.subscribeCoalesced) {
      try { orbCoalesceUnsub = shared.refs.subscribeCoalesced(function(){ try{ syncThinkingOrb(); }catch(e){} }); return; } catch(e){}
    }
    if (window.MutationObserver) {
      orbMutObs = new MutationObserver(function() {
        try { syncThinkingOrb(); } catch(e) {}
      });
      var rootEl = document.querySelector("#root") || document.documentElement;
      try {
        orbMutObs.observe(rootEl, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ["data-state", "data-tool", "aria-label", "class", "data-plan-mode", "role"]
        });
      } catch(e) {}
    }
  }

  // SR 播报节点为懒创建（ensureSrAnnouncer 在 startThinkingOrb / announceSrStatus 首用时机创建），
  // 关闭 Orbs 的用户不承受额外 DOM/ARIA 负担

  shared.refs.syncThinkingOrb = syncThinkingOrb;
  shared.refs.stopThinkingOrb = stopThinkingOrb;
  shared.refs.watchThinkingOrbs = watchThinkingOrbs;
  shared.refs.orbsHandle = {
    start: startThinkingOrb,
    stop: stopThinkingOrb,
    sync: syncThinkingOrb,
    watch: watchThinkingOrbs,
    detach: detachThinkingOrbs,
    get active() { return orbActive; },
    get canvas() { return orbCanvas; },
    get state() { return orbCurrentState; },
    get lastRecord() { return lastActiveToolRecord; },
    get queue() { return toolQueue.slice(); },
    get display() { return displayInfo; },
    resolveState: resolveActiveToolState,
    rawDetect: rawDetect,
    getPreset: getOrbPreset
  };
}



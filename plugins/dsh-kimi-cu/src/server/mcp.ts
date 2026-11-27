import { isMcpConnecting, type KimiCuStatus, type KimiMcpStatus } from '../shared/status.ts';

const MCP_SERVER_NAME = 'kimi-cu';
const MCP_TOOL_TIMEOUT_MS = 300_000;
const MCP_CONNECT_TIMEOUT_MS = 35_000;

interface McpView {
  name: string;
  configured: boolean;
  status: { state: string; lastError?: string; reason?: string; result?: { cleanupError?: string } };
}

export interface McpManager {
  register(name: string, entry: { transport: 'stdio'; command: string; args: string[]; toolCallTimeoutMs: number }): () => void;
  list(): McpView[];
  watch(signal: AbortSignal): AsyncIterable<McpView[]>;
  restart(name: string): Promise<void>;
}

export interface ComputerUse {
  providerName: string | undefined;
  register(name: string): () => Promise<void>;
}

interface Registration {
  manager: McpManager;
  registry: ComputerUse | undefined;
  command: NonNullable<KimiCuStatus['mcp']>;
  withdraw: () => void;
  release: (() => Promise<void>) | undefined;
  observe: AbortController;
}

function kimiView(views: McpView[]): McpView | undefined {
  return views.find(({ name }) => name === MCP_SERVER_NAME);
}

function statusOf(view: McpView): KimiMcpStatus {
  const { state, reason, lastError, result } = view.status;
  const detail = lastError ?? result?.cleanupError ?? reason;
  return { state, ...(detail === undefined ? {} : { lastError: detail }) };
}

function isTerminal(state: string): boolean {
  return state !== 'connected' && !isMcpConnecting(state);
}

export function createMcpConnection(warn: (message: string) => void) {
  let current: Registration | undefined;
  let failure: KimiMcpStatus | null = null;
  let lastDetection: KimiCuStatus | undefined;
  let manager: McpManager | undefined;
  let registry: ComputerUse | undefined;
  let tail = Promise.resolve();

  const enqueue = <T>(work: () => Promise<T>): Promise<T> => {
    const next = tail.then(work);
    tail = next.then(() => {}, () => {});
    return next;
  };

  const read = (): KimiMcpStatus | null => {
    const view = current === undefined ? undefined : kimiView(current.manager.list());
    return view === undefined ? failure : statusOf(view);
  };

  const disconnect = async (registration: Registration): Promise<void> => {
    current = undefined;
    registration.observe.abort();
    registration.withdraw();
    // register() exposes a void disposer. The manager's watch confirms that
    // its old record and tools have been removed before the slot is released.
    if (registration.release === undefined) return;
    const signal = new AbortController();
    for await (const views of registration.manager.watch(signal.signal)) {
      const view = kimiView(views);
      if (view === undefined || view.configured) break;
      if (view.status.reason === 'cleanup') {
        failure = statusOf(view);
        // Cleanup was unconfirmed. The slot remains owned until the host stops.
        return;
      }
    }
    await registration.release();
  };

  const report = (state: string, error: unknown): void => {
    const lastError = error instanceof Error ? error.message : String(error);
    if (failure?.state !== state || failure.lastError !== lastError) warn('KimiCU: ' + lastError);
    failure = { state, lastError };
  };

  const observe = async (registration: Registration): Promise<void> => {
    for await (const views of registration.manager.watch(registration.observe.signal)) {
      const view = kimiView(views);
      if (view !== undefined && !isTerminal(view.status.state)) continue;
      await enqueue(async () => {
        if (current !== registration) return;
        const latest = kimiView(registration.manager.list());
        if (latest !== undefined && !isTerminal(latest.status.state)) return;
        failure = latest === undefined ? null : statusOf(latest);
        await disconnect(registration);
      });
      return;
    }
  };

  const reconcile = async (): Promise<void> => {
    const status = lastDetection;
    const command = status?.supported && status.installed && status.doctor.ok && !status.notes.includes('mcp-command-missing')
      ? status.mcp : null;
    if (current !== undefined) {
      if (command !== null && current.manager === manager && current.registry === registry
        && current.command.command === command.command && JSON.stringify(current.command.args) === JSON.stringify(command.args)) return;
      await disconnect(current);
    }
    if (command === null || manager === undefined) {
      failure = null;
      return;
    }
    if (registry?.providerName !== undefined) {
      report('conflict', registry.providerName);
      return;
    }
    const activeRegistry = registry;
    const activeManager = manager;
    let release: (() => Promise<void>) | undefined;
    try {
      release = activeRegistry?.register(MCP_SERVER_NAME);
    } catch (error) {
      report('conflict', error);
      return;
    }
    try {
      const withdraw = activeManager.register(MCP_SERVER_NAME, {
        transport: 'stdio',
        command: command.command,
        args: command.args,
        toolCallTimeoutMs: MCP_TOOL_TIMEOUT_MS,
      });
      const registration = { manager: activeManager, registry: activeRegistry, command, withdraw, release, observe: new AbortController() };
      current = registration;
      failure = null;
      void observe(registration).catch((error: unknown) => warn('KimiCU MCP: ' + String(error)));
    } catch (error) {
      await release?.();
      report('registration-failed', error);
    }
  };

  return {
    setManager(value: McpManager | undefined) {
      manager = value;
      return enqueue(reconcile);
    },
    setRegistry(value: ComputerUse | undefined) {
      registry = value;
      return enqueue(reconcile);
    },
    sync(status: KimiCuStatus) {
      return enqueue(async () => {
        lastDetection = status;
        await reconcile();
      });
    },
    read,
    restart(status: KimiCuStatus) {
      return enqueue(async () => {
        const previous = current;
        lastDetection = status;
        await reconcile();
        const registration = current;
        if (registration !== undefined && registration === previous) await registration.manager.restart(MCP_SERVER_NAME);
        return registration;
      }).then(async (registration) => {
        if (registration === undefined) return false;
        const signal = AbortSignal.any([registration.observe.signal, AbortSignal.timeout(MCP_CONNECT_TIMEOUT_MS)]);
        for await (const views of registration.manager.watch(signal)) {
          const state = kimiView(views)?.status.state;
          if (state === 'connected') return current === registration;
          if (state === undefined || isTerminal(state)) return false;
        }
        return false;
      });
    },
  };
}

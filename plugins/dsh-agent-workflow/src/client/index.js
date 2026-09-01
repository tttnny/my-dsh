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

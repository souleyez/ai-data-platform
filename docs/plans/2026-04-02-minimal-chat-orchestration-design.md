# 2026-04-02 Minimal Chat Orchestration Design

## Goal

Chat should stop feeling like a local router that rewrites user intent. The platform should mainly do two things:

1. Supply OpenClaw with the right system context and matched library evidence.
2. Intercept only library-backed template-output requests and ask for explicit confirmation before execution.

Everything else should remain a direct OpenClaw conversation.

## Target Behavior

### 1. General chat becomes supply-first, not route-first

- Remove the current `general/catalog/detail/output` routing from ordinary chat replies.
- For ordinary chat, the backend may still:
  - identify matched libraries,
  - retrieve relevant documents/evidence,
  - build a system-capability block,
  - build a user-constraints block,
  - build a knowledge-supply block.
- Those blocks are passed to OpenClaw as context only.
- The backend should no longer rewrite the user request into a catalog answer, detail answer, or report shell unless the request is a confirmed template-output execution.

### 2. Both service mode and full mode expose system capability context

- OpenClaw should always know it is operating inside the AI data platform.
- The capability block should describe:
  - document center,
  - datasource center,
  - report center,
  - default web-search availability,
  - current permission level.
- `service` and `full` differ only in permission wording, not in whether the system is explained.

### 3. Template output is the only remaining orchestration

If a request both:

- clearly asks for a deliverable such as `table/page/pdf/ppt`, and
- has actual library/document hits,

the backend must not directly execute it.

Instead it returns a confirmation card with **two options** every time:

1. `按 OpenClaw 理解执行`
2. `按 XXX 库 XXX 时间范围资料，使用 XXX 模板输出 XXXXX`

Even if the two options are effectively the same, both must still be shown.

Confirmation behavior:

- Option 1 goes back through normal OpenClaw chat with the confirmed action wording.
- Option 2 runs the existing library/template output pipeline.

### 4. Search stays enabled by default

- Real-time questions should continue to prefer native OpenClaw web search first.
- Project-side web search remains as fallback.
- System context should explicitly tell OpenClaw that real-time web search is available by default for current/latest questions.

### 5. User-visible system constraints box

- Add a separate visible constraints box in the chat area.
- Users can state what the assistant should do or avoid doing.
- Example constraints:
  - do not output tables unless I confirm,
  - answer briefly,
  - prefer contract library first,
  - do not suggest system actions.
- These constraints are sent on every chat request and injected into the OpenClaw system context as a dedicated block.

## Implementation Outline

### Backend

- Add a generic system-context builder for:
  - platform capabilities,
  - default search behavior,
  - user constraints.
- Replace general chat routing with a `supply-first` path:
  - build scoped retrieval,
  - attach context blocks,
  - call OpenClaw directly.
- Add a template-confirmation detector/builder:
  - detect output intent,
  - resolve matched libraries,
  - resolve time range,
  - resolve best-fit template summary,
  - ask OpenClaw for its own intended action summary,
  - return a confirmation payload.
- Keep `knowledge_output` mode only for explicit confirmed template execution.

### Frontend

- Remove visible orchestration status from chat bubbles.
- Add a visible system-constraints textarea above the composer.
- Render confirmation cards with two explicit actions.
- Persist the constraint text locally and resend it on every request.

## Non-goals

- This change does not make the platform a full general-purpose tool-calling agent.
- This change does not remove the existing template/report execution pipeline.
- This change does not remove project-side search fallback.

# Image VLM Integration Implementation Plan

**Goal:** Add a MiniMax-backed image understanding enhancement path for image documents while keeping the existing OCR quick-parse path and the current knowledge pipeline intact.

**Architecture:** Keep image files in the current document ingest and parse flow. Use OCR or metadata for quick parse, then run image understanding only in detailed parse / cloud enrichment for image files. The detailed parse path should call OpenClaw skill mode and rely on MiniMax's `image` / `understand_image` capability behind OpenClaw. Normalize the result back into `ParsedDocument`, `structuredProfile`, and `evidenceChunks`.

**Tech Stack:** Fastify API, Next.js App Router, OpenClaw gateway, existing document parser and detailed parse queue, local JSON runtime repositories.

---

## Scope

This plan implements the design in:

- `C:\Users\soulzyn\Desktop\codex\ai-data-platform\docs\plans\2026-04-08-image-vlm-integration-design.md`

This plan includes:

1. Image VLM provider and prompt contract
2. Detailed parse integration for image files
3. OpenClaw image-tool capability probe
4. Normalization into existing `ParsedDocument` fields
5. Document detail UI exposure
6. Unit and integration regressions

This plan does not include:

1. Scanned PDF VLM parsing
2. A separate image database
3. Interactive crop or annotation tooling
4. A new retrieval engine

## Guardrails

1. Keep OCR quick parse as the sync baseline
2. Run VLM only in detailed parse for first version
3. Reuse `detailParseStatus` and `cloudStructuredAt`, do not add a second status plane unless proven necessary
4. Normalize visual understanding back into existing knowledge objects
5. Fail safely to OCR-only mode when OpenClaw image tool or MiniMax capability is unavailable

## Outcome Targets

When this plan is complete:

1. Image documents gain visual understanding beyond OCR text
2. VLM output is stored in `summary`, `evidenceChunks`, and `structuredProfile`
3. Document detail shows whether the result came from OCR, VLM, or both
4. Image parsing failures do not block document ingest

### Task 1: Add Image VLM Provider via OpenClaw Skill

**Files:**
- Add: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\src\lib\document-image-vlm-provider.ts`
- Modify: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\src\lib\document-advanced-parse-provider.ts`
- Test: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\test\document-image-vlm-provider.test.ts`

**Step 1: Write failing provider tests**

Cover:

1. provider is disabled when env says so
2. provider assembles a prompt that points OpenClaw skill mode to the local image path
3. provider returns parsed JSON payload with model info
4. provider records tool-unavailable failures as fallback-safe errors

Run:

```powershell
corepack pnpm --filter api exec tsx --test test/document-image-vlm-provider.test.ts
```

Expected: FAIL because provider does not exist yet.

**Step 2: Implement provider config**

Support:

```text
DOCUMENT_IMAGE_PARSE_MODE=ocr-plus-vlm
DOCUMENT_IMAGE_VLM_PROVIDER=openclaw-skill
DOCUMENT_IMAGE_VLM_TOOL=image
DOCUMENT_IMAGE_VLM_TIMEOUT_MS=45000
DOCUMENT_IMAGE_VLM_MAX_IMAGE_BYTES=20000000
```

**Step 3: Implement strict prompt contract**

Return strict JSON only with:

1. `summary`
2. `documentKind`
3. `layoutType`
4. `topicTags`
5. `visualSummary`
6. `evidenceBlocks`
7. `fieldCandidates`
8. `entities`
9. `claims`
10. `transcribedText`

In the provider prompt, explicitly instruct OpenClaw to use the image-understanding capability on the local image path and return only the JSON contract.

**Step 4: Run provider tests**

Expected: PASS.

### Task 2: Add OpenClaw Image Capability Probe

**Files:**
- Add: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\src\lib\document-image-vlm-capability.ts`
- Test: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\test\document-image-vlm-capability.test.ts`

**Step 1: Write failing capability tests**

Cover:

1. missing OpenClaw gateway returns unavailable
2. configured runtime but missing image-tool hint returns unavailable
3. configured runtime with image-tool support returns available

**Step 2: Implement a minimal capability probe**

First version can be conservative:

1. require OpenClaw gateway configured
2. require image parse mode enabled
3. optionally probe with a lightweight no-op request or runtime capability flag

Do not block document ingest on probe failure.

### Task 3: Merge Image VLM into Detailed Parse

**Files:**
- Modify: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\src\lib\document-cloud-enrichment.ts`
- Modify: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\src\lib\document-parser.ts`
- Test: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\test\document-image-vlm.test.ts`

**Step 1: Write failing merge tests**

Cover:

1. image file with OCR text gains VLM summary and evidence
2. image file with empty OCR still becomes `parsed` if VLM succeeds
3. VLM failure preserves OCR result
4. merge result updates `parseMethod`

**Step 2: Branch enrichment by file extension**

In `document-cloud-enrichment.ts`:

1. detect image extensions
2. call image VLM provider instead of text-only advanced parse
3. keep text-only enrichment for non-image files

**Step 3: Normalize merge result**

Write VLM output into:

1. `summary`
2. `excerpt`
3. `topicTags`
4. `evidenceChunks`
5. `entities`
6. `claims`
7. `structuredProfile.imageUnderstanding`

Update `parseMethod` to `image-vlm` or `image-ocr+vlm` as appropriate.

### Task 4: Connect Governance Hints

**Files:**
- Modify: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\src\lib\document-cloud-enrichment.ts`
- Modify: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\src\lib\document-extraction-governance.ts`
- Test: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\test\document-image-vlm-governance.test.ts`

**Step 1: Write failing governance tests**

Cover:

1. library `fieldPrompts` are included in image VLM extraction hints
2. `fieldAliases` still normalize candidate fields
3. normalization rules still apply after VLM extraction

**Step 2: Inject governance prompt fragments**

For image documents, include:

1. preferred fields
2. required fields
3. field prompts
4. aliases

Keep prompt compact to avoid exploding token size.

### Task 5: Update UI and Support Matrix

**Files:**
- Modify: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\web\app\documents\DocumentAnalysisPanel.js`
- Modify: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\src\lib\format-support-matrix.ts`

**Step 1: Add document detail fields**

Expose:

1. visual parse source
2. VLM model
3. visual summary

Prefer reusing existing panel blocks instead of adding a separate image-analysis page.

**Step 2: Update support matrix**

Change image notes from OCR-only wording to OCR + VLM enhancement wording.

### Task 6: End-to-End Regression

**Files:**
- Add: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\test\document-image-vlm-e2e.test.ts`

**Step 1: Cover the main path**

Test this flow:

```text
image file
  -> parseDocument
  -> detailed parse
  -> structuredProfile / evidenceChunks
  -> document cache write
```

Mock the VLM provider instead of calling a real gateway in CI.

**Step 2: Run the focused suite**

```powershell
corepack pnpm --filter api exec tsx --test test/document-image-vlm-provider.test.ts test/document-image-vlm-capability.test.ts test/document-image-vlm.test.ts test/document-image-vlm-governance.test.ts test/document-image-vlm-e2e.test.ts
corepack pnpm --filter api build
corepack pnpm --filter web build
```

### Task 7: Optional Phase-2 Extension for Scanned PDF

Only after the image-first path is stable:

1. detect image-heavy PDF pages
2. render pages to bitmaps
3. feed the same image VLM provider
4. merge with PDF OCR result

Do not start this task in the first implementation round.

## Suggested Commit Slices

1. `feat: add image vlm provider via openclaw`
2. `feat: probe image tool capability`
3. `feat: enrich image documents with minimax vlm`
4. `feat: expose image vlm analysis in document detail`
5. `test: add image vlm regression coverage`

## Recommended Start Order

Implement in this order:

1. provider wrapper
2. capability probe
3. image detailed parse merge
4. governance injection
5. UI exposure
6. e2e regression

This keeps the first version aligned with MiniMax's official OpenClaw path and avoids unnecessary protocol work in the API layer.

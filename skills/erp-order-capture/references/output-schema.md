# Output Schema

Return a single JSON object using this shape:

```json
{
  "transport": "api",
  "captureMode": "list_then_detail",
  "objective": "",
  "readonlyGuards": [],
  "login": {
    "entryPath": "",
    "successSignals": [],
    "requiredCredentials": []
  },
  "listCapture": {
    "pathHints": [],
    "filterHints": [],
    "columns": [],
    "paginationHints": []
  },
  "detailCapture": {
    "pathHints": [],
    "fields": [],
    "lineItemFields": []
  },
  "incrementalSync": {
    "cursorCandidates": [],
    "dedupeKeys": [],
    "watermarkPolicy": ""
  },
  "warnings": []
}
```

## Field guidance

- `transport`
  - `api`, `session`, or `generic`
  - align with the datasource execution hints unless the evidence strongly says otherwise

- `captureMode`
  - `list_then_detail`, `portal_export`, or `hybrid`
  - `list_then_detail` is preferred for readonly APIs
  - `portal_export` is preferred for readonly portal/session systems

- `objective`
  - one short sentence
  - describe the readonly order-capture goal, not generic ERP prose

- `readonlyGuards`
  - 2-6 short rules
  - block write actions, approval flows, and unrelated modules

- `login`
  - `entryPath` should be the safest readonly entry or login page
  - `successSignals` should describe what confirms a usable session or token
  - `requiredCredentials` should be normalized labels such as `api_token`, `username`, `password`, `session_cookie`

- `listCapture`
  - path hints should focus on order list or export pages
  - filters should favor date range, status, updated time, and business scope
  - columns should prefer stable order header fields
  - pagination hints should describe page or export behavior

- `detailCapture`
  - path hints should focus on order detail, order item, payment, and delivery views
  - `fields` should cover order-level detail
  - `lineItemFields` should cover SKU or item-level detail

- `incrementalSync`
  - list 1-4 cursor candidates such as `updated_at`, `last_modified_at`, or `biz_date`
  - dedupe keys should favor order number and stable ERP IDs
  - watermark policy should be one short operational sentence

- `warnings`
  - only include real capture gaps such as missing auth or unclear module scope

## Quality bar

- Favor executable readonly hints over decorative wording.
- Keep API and portal contracts separate in style.
- Prefer a shorter safe contract over an ambitious unstable one.

## Output schema

Return exactly one JSON object with this shape:

```json
{
  "title": "string",
  "summary": "string",
  "page": {
    "summary": "string",
    "cards": [
      { "label": "string", "value": "string", "note": "string" }
    ],
    "sections": [
      { "title": "string", "body": "string", "bullets": ["string"] }
    ],
    "charts": [
      {
        "title": "string",
        "items": [
          { "label": "string", "value": 1 }
        ]
      }
    ]
  },
  "warnings": ["string"]
}
```

## Constraints

- Keep `sections` aligned with the supplied envelope section order.
- Keep `cards` concise and dashboard-like:
  - 4-5 cards when evidence is strong
  - 2-3 cards when evidence is weak
- Keep `charts` purposeful:
  - 2-4 charts maximum
  - each chart should tell a distinct story
- Prefer channel, category, and SKU names exactly as supplied in the evidence.
- Prefer stable operational labels such as:
  - `channel gmv`
  - `active skus`
  - `risk sku`
  - `inventory health`
  - `replenishment priority`
- Avoid generic labels such as:
  - `metric 1`
  - `key data`
  - `trend analysis`
- If metrics are missing, lower specificity instead of inventing numbers.
- Use `warnings` only when evidence weakness should be visible to downstream logic or artifacts.
- Do not output markdown fences or extra commentary.

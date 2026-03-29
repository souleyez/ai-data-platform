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
  }
}
```

## Constraints

- Keep `sections` aligned with the supplied envelope section order.
- Keep `cards` and `charts` concise and presentation-ready.
- Prefer short project nouns and stable organization labels.
- For client resume pages, prefer a shortlist / proposal style:
  - `代表候选人` should read like customer-facing shortlist entries.
  - `代表项目` should highlight reusable delivery evidence, not long responsibility sentences.
  - `匹配建议` should connect candidates, projects, and skills to a plausible customer scenario.
- Do not output markdown fences or extra commentary.

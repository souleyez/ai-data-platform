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
- Do not output markdown fences or extra commentary.

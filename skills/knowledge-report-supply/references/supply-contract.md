# Supply Contract

Return a compact JSON object with the best available evidence package for downstream answering or report generation.

## Preferred shape

```json
{
  "scope": {
    "libraries": [
      {
        "key": "",
        "label": ""
      }
    ],
    "timeRange": "",
    "contentFocus": "",
    "templateTaskHint": "",
    "outputKind": ""
  },
  "documents": [
    {
      "title": "",
      "source": "",
      "summary": "",
      "schemaType": "",
      "whySelected": ""
    }
  ],
  "evidence": [
    {
      "title": "",
      "text": "",
      "source": "",
      "dimension": "",
      "whySelected": ""
    }
  ],
  "templateGuidance": {
    "preferredColumns": [],
    "preferredSections": [],
    "groupingHints": [],
    "outputHint": ""
  },
  "conceptPage": {
    "primaryDimension": "",
    "recommendedSections": [],
    "recommendedCards": [],
    "recommendedCharts": [],
    "groupingHints": []
  },
  "gaps": []
}
```

## Field guidance

- `scope`
  - reflect the effective bounded scope actually used

- `documents`
  - keep to the most relevant 3-8 items
  - explain why each one was selected

- `evidence`
  - keep to the most useful evidence blocks
  - include dimensions such as company, project, skill, section, metric, ingredient, risk

- `templateGuidance`
  - use when the request implies a known output pattern
  - help downstream generation stay close to the intended template

- `conceptPage`
  - use when the output is a data-visualized static page without an explicitly named custom template
  - suggest the best page concept:
    - primary dimension
    - recommended sections
    - card ideas
    - chart ideas
    - grouping hints

- `gaps`
  - list important missing evidence or low-confidence areas

## Quality bar

- Be selective.
- Keep the supply package small enough for a model to consume easily.
- Prefer supply that is directly reusable in a report or grounded answer.
- Do not include irrelevant chat history or operational noise.

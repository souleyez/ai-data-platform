# Output Schema

Return a single JSON object using this shape:

```json
{
  "summary": "",
  "topicTags": [],
  "riskLevel": "low",
  "evidenceBlocks": [
    {
      "title": "",
      "text": ""
    }
  ],
  "entities": [
    {
      "text": "",
      "type": "",
      "confidence": 0.8,
      "evidenceText": ""
    }
  ],
  "claims": [
    {
      "subject": "",
      "predicate": "",
      "object": "",
      "confidence": 0.8,
      "evidenceText": ""
    }
  ],
  "intentSlots": {
    "audiences": [],
    "ingredients": [],
    "strains": [],
    "benefits": [],
    "doses": [],
    "organizations": [],
    "metrics": []
  }
}
```

## Field guidance

- `summary`
  - 1-3 sentences
  - describe the document's practical purpose, not generic prose

- `topicTags`
  - 3-12 normalized tags
  - prefer durable business tags over decorative wording

- `riskLevel`
  - `low`, `medium`, or `high`
  - use `medium` when the document contains obligations, compliance, delivery, or qualification pressure

- `evidenceBlocks`
  - 3-8 blocks
  - each block should be useful for retrieval or downstream evidence display

- `entities`
  - only include supported entities
  - examples: person, organization, product, ingredient, strain, metric, technology, role

- `claims`
  - use simple subject-predicate-object triples
  - only include claims that are materially useful

- `intentSlots`
  - fill with reusable query terms for downstream retrieval and reporting
  - prefer normalized nouns or noun phrases

## Quality bar

- Favor precision over coverage.
- Prefer an empty field over an invented field.
- Extract wording that helps later retrieval, comparison, and report generation.

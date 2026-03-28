# Datasource Body Extraction Contract

Return strict JSON with this shape:

```json
{
  "title": "string",
  "sourceUrl": "string",
  "pageType": "article | discovery | gated | weak",
  "summary": "string",
  "cleanBody": "string",
  "keySections": [
    {
      "heading": "string",
      "snippet": "string"
    }
  ],
  "candidateLinks": [
    {
      "title": "string",
      "url": "string",
      "reason": "string",
      "score": 0
    }
  ],
  "qualitySignals": [
    "string"
  ],
  "warnings": [
    "string"
  ]
}
```

## Field notes

- `title`
  - Best cleaned page title.
- `sourceUrl`
  - Final URL after redirects when available.
- `pageType`
  - `article` for strong正文.
  - `discovery` for landing or listing pages.
  - `gated` for login or permission walls.
  - `weak` when usable正文 is minimal.
- `summary`
  - Short ingestion-safe summary.
  - Prefer 1-3 sentences.
- `cleanBody`
  - Main正文 after denoising.
  - Keep bounded and readable.
  - Do not dump full raw HTML or full-page chrome.
- `keySections`
  - Optional high-value sections from正文.
  - Keep 0-6 items.
- `candidateLinks`
  - Use mainly for `discovery` pages.
  - Keep 0-10 items.
  - Sort by value for ingestion, not by page order alone.
- `qualitySignals`
  - Examples:
    - `main-body-detected`
    - `title-reliable`
    - `source-snippets-kept`
    - `discovery-links-ranked`
    - `login-wall-detected`
- `warnings`
  - Use when quality is limited:
    - `body-too-short`
    - `login-required`
    - `navigation-heavy`
    - `candidate-links-weak`

## Contract rules

- Return valid JSON only.
- Use empty arrays instead of fabricating content.
- For `article`, prefer stronger `cleanBody` and fewer `candidateLinks`.
- For `discovery`, prefer stronger `candidateLinks` and a shorter `cleanBody`.
- For `gated`, keep `cleanBody` short and explain the blocker in `warnings`.
- Never include secrets, cookies, or credentials in the output.

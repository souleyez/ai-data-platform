# Detail Answer Contract

Return a direct natural-language answer, not JSON.

## Required behavior

- Lead with the conclusion or the clearest supported answer.
- Base the answer on the supplied live document detail and evidence only.
- When the request asks for comparison, summarize the strongest differences first.
- When the request asks for a specific field or fact, answer that field first before adding context.
- If detail coverage is partial, say so explicitly instead of implying full document verification.

## Preferred answer shape

1. Direct answer
2. Strongest supporting details
3. Remaining uncertainty or missing detail, only when needed

## Do not do

- Do not switch into catalog inventory mode
- Do not produce table/page/report JSON
- Do not invent unsupported facts
- Do not claim full-file verification when only partial detail is supplied

Return JSON in this shape:

{
  "profiles": [
    {
      "sourcePath": "absolute-or-stable-source-path",
      "sourceName": "original file name",
      "displayName": "candidate name for presentation",
      "displayCompany": "stable employer or organization label",
      "displayProjects": ["project/system/platform label"],
      "displaySkills": ["skill label"],
      "displaySummary": "one short customer-facing profile summary"
    }
  ]
}

Constraints:
- `sourcePath` must match the provided document source path exactly when available.
- `displayName` should be a real human name, not a role title or slug.
- `displayCompany` should be an organization label, not a department fragment or narrative sentence.
- `displayProjects` should be short project nouns, not long responsibility descriptions.
- `displaySkills` should be reusable labels, not fragments or placeholders.
- Use empty strings or empty arrays when unsure.

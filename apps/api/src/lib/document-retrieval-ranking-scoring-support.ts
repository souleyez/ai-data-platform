export function collectAliasProfileData(profile: Record<string, unknown>) {
  const fieldTemplate =
    profile.fieldTemplate && typeof profile.fieldTemplate === 'object'
      ? (profile.fieldTemplate as Record<string, unknown>)
      : null;
  const fieldAliases =
    fieldTemplate?.fieldAliases && typeof fieldTemplate.fieldAliases === 'object'
      ? (fieldTemplate.fieldAliases as Record<string, unknown>)
      : null;
  const aliasMaps = [profile.focusedAliasFields, profile.aliasFields]
    .filter((entry) => entry && typeof entry === 'object') as Array<Record<string, unknown>>;

  const aliasNames = new Set<string>();
  const aliasValues = new Set<string>();

  for (const [canonicalField, aliasValue] of Object.entries(fieldAliases || {})) {
    const normalizedAliasName = String(aliasValue || '').trim();
    if (normalizedAliasName) aliasNames.add(normalizedAliasName.toLowerCase());

    const canonicalValue = String(profile[canonicalField] || '').trim();
    if (canonicalValue) aliasValues.add(canonicalValue.toLowerCase());
  }

  for (const aliasMap of aliasMaps) {
    for (const [aliasName, aliasValue] of Object.entries(aliasMap)) {
      const normalizedAliasName = String(aliasName || '').trim();
      const normalizedAliasValue = String(aliasValue || '').trim();
      if (normalizedAliasName) aliasNames.add(normalizedAliasName.toLowerCase());
      if (normalizedAliasValue) aliasValues.add(normalizedAliasValue.toLowerCase());
    }
  }

  return {
    aliasNamesText: [...aliasNames].join(' '),
    aliasValuesText: [...aliasValues].join(' '),
  };
}

export function normalizeEvidenceChunkText(chunkText: unknown) {
  return (typeof chunkText === 'string'
    ? chunkText
    : typeof (chunkText as any)?.text === 'string'
      ? (chunkText as any).text
      : String(chunkText || '')).toLowerCase();
}

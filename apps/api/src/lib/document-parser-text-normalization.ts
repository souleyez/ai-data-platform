export function stripMarkdownSyntax(text: string) {
  return text
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/`{1,3}([^`]+)`{1,3}/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1');
}

export function normalizeText(text: string) {
  return stripMarkdownSyntax(text).replace(/[\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim();
}

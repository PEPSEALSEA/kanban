export function preprocessDiscordMarkdown(text: string): string {
  return text
    .replace(/\[\(([^)]*)\)\]\(<([^>]+)>\)/g, '[$1]($2)')
    .replace(/<(https?:\/\/[^>]+)>/g, '[$1]($1)')
    .replace(/\|\|([^|]+)\|\|/g, '<span class="discord-spoiler">$1</span>');
}

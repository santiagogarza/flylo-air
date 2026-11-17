export type PolicyBlock =
  | { type: 'heading'; id: string; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; items: string[] };

export function parsePolicy(markdown: string): PolicyBlock[] {
  const blocks: PolicyBlock[] = [];
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  let paragraph: string[] = [];
  let list: string[] | null = null;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push({ type: 'paragraph', text: paragraph.join(' ') });
    paragraph = [];
  };
  const flushList = () => {
    if (!list) return;
    blocks.push({ type: 'list', items: list });
    list = null;
  };

  for (const line of lines) {
    const heading = /^##\s+(.+)$/.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      const text = heading[1].trim();
      blocks.push({ type: 'heading', id: headingId(text), text });
      continue;
    }
    const item = /^(?:-|\d+\.)\s+(.+)$/.exec(line);
    if (item) {
      flushParagraph();
      list = list ?? [];
      list.push(item[1].trim());
      continue;
    }
    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }
    flushList();
    paragraph.push(line.trim());
  }
  flushParagraph();
  flushList();
  return blocks;
}

export function headingId(text: string): string {
  const match = /§\s*(\d+)/.exec(text);
  if (match) return `s${match[1]}`;
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

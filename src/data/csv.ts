/** Minimal CSV parser: header row + rows, supports double-quoted fields. Returns objects keyed by header. */
export function parseCsv(text: string): Record<string, string>[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n").filter((l) => l.length > 0);
  if (lines.length === 0) return [];
  const header = splitLine(lines[0]!);
  const rows: Record<string, string>[] = [];
  for (let li = 1; li < lines.length; li++) {
    const cells = splitLine(lines[li]!);
    if (cells.length !== header.length) {
      throw new Error(`CSV line ${li + 1}: expected ${header.length} fields, got ${cells.length}`);
    }
    const row: Record<string, string> = {};
    header.forEach((h, i) => (row[h] = cells[i]!));
    rows.push(row);
  }
  return rows;
}

function splitLine(line: string): string[] {
  const out: string[] = [];
  let cur = "", quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

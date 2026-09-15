export type Syntax = 'tag' | 'inline' | 'closing';
export interface Region {
  kind: 'helper' | 'argument' | 'value';
  start: number;
  end: number;
  helper: string;
  syntax: Syntax;
  argument?: string;
  used: string[];
  quoted?: boolean;
  hasAssignment?: boolean;
}

/** A tolerant scanner: incomplete input is normal while editing a template. */
export function scanFluid(text: string): Region[] {
  const regions: Region[] = [];
  const length = text.length;
  const isName = (c: string) => /[\w.:-]/.test(c);
  const skipSpace = (p: number) => { while (p < length && /\s/.test(text[p])) p++; return p; };
  function add(kind: Region['kind'], start: number, end: number, helper: string,
    syntax: Syntax, used: string[], extra: Partial<Region> = {}) {
    regions.push({ kind, start, end, helper, syntax, used, ...extra });
  }

  function stringEnd(p: number): number {
    const quote = text[p++];
    while (p < length) {
      if (text[p] === '\\') { p += 2; continue; }
      if (text[p] === quote) return p;
      // Fluid interpolation is also valid inside quoted argument values.
      if (text[p] === '{') { p = expression(p + 1, '}'); continue; }
      p++;
    }
    return length;
  }

  function expression(p: number, closing: string): number {
    while (p < length) {
      if (text[p] === closing) return p + 1;
      if (text[p] === '"' || text[p] === "'") { p = Math.min(stringEnd(p) + 1, length); continue; }
      if (text.startsWith('f:', p) && (p === 0 || !/[\w.:-]/.test(text[p - 1]))) {
        p = inline(p); continue;
      }
      const close = ({ '{': '}', '[': ']', '(': ')' } as Record<string, string>)[text[p]];
      if (close) { p = expression(p + 1, close); continue; }
      p++;
    }
    return p;
  }

  function valueEnd(p: number, syntax: Syntax): number {
    while (p < length) {
      const c = text[p];
      if (syntax === 'inline' && /[,)}]/.test(c)) return p;
      if (syntax === 'tag' && /[\s>]/.test(c)) return p;
      if (c === '"' || c === "'") { p = Math.min(stringEnd(p) + 1, length); continue; }
      if (text.startsWith('f:', p) && (p === 0 || !/[\w.:-]/.test(text[p - 1]))) {
        p = inline(p); continue;
      }
      const close = ({ '{': '}', '[': ']', '(': ')' } as Record<string, string>)[c];
      if (close) { p = expression(p + 1, close); continue; }
      p++;
    }
    return p;
  }

  function inline(start: number): number {
    let p = start + 2;
    while (p < length && /[\w.]/.test(text[p])) p++;
    const helper = text.slice(start, p);
    const used: string[] = [];
    add('helper', start, p, helper, 'inline', used);
    p = skipSpace(p);
    if (text[p] !== '(') return p;
    p++;
    while (p <= length) {
      const whitespace = p;
      p = skipSpace(p);
      if (text[p] === ')' || text[p] === '}' || p === length) {
        add('argument', whitespace, p, helper, 'inline', used);
        return text[p] === ')' ? p + 1 : p;
      }
      const nameStart = p;
      while (p < length && /[\w]/.test(text[p])) p++;
      const name = text.slice(nameStart, p);
      const end = p;
      p = skipSpace(p);
      const assigned = text[p] === ':';
      if (whitespace < nameStart) add('argument', whitespace, nameStart - 1, helper, 'inline', used);
      add('argument', nameStart, end, helper, 'inline', used, { argument: name, hasAssignment: assigned });
      if (!assigned) return Math.max(p, nameStart + 1);
      used.push(name);
      p = skipSpace(p + 1);
      const quoted = text[p] === '"' || text[p] === "'";
      const valueStart = p + (quoted ? 1 : 0);
      const endValue = quoted ? stringEnd(p) : valueEnd(p, 'inline');
      add('value', valueStart, endValue, helper, 'inline', used, { argument: name, quoted });
      p = skipSpace(endValue + (quoted && endValue < length ? 1 : 0));
      if (text[p] === ',') { p++; continue; }
      return text[p] === ')' ? p + 1 : p;
    }
    return p;
  }

  function tag(start: number): number {
    let p = start + 1;
    const closing = text[p] === '/';
    if (closing) p++;
    const nameStart = p;
    while (p < length && isName(text[p])) p++;
    const helper = text.slice(nameStart, p);
    const fluid = helper.startsWith('f:');
    const syntax = closing ? 'closing' : 'tag';
    const used: string[] = [];
    if (fluid) add('helper', nameStart, p, helper, syntax, used);
    while (p <= length) {
      const whitespace = p;
      p = skipSpace(p);
      if (p === length || text[p] === '>' || text.startsWith('/>', p) || text[p] === '<') {
        if (fluid && !closing && p > whitespace) add('argument', whitespace + 1, p, helper, syntax, used);
        if (text.startsWith('/>', p)) return p + 2;
        if (text[p] === '>') return p + 1;
        return p;
      }
      const attrStart = p;
      while (p < length && isName(text[p])) p++;
      if (p === attrStart) { p++; continue; }
      const name = text.slice(attrStart, p);
      const end = p;
      p = skipSpace(p);
      const assigned = text[p] === '=';
      if (fluid && !closing) {
        if (whitespace + 1 < attrStart) add('argument', whitespace + 1, attrStart - 1, helper, syntax, used);
        add('argument', attrStart, end, helper, syntax, used, { argument: name, hasAssignment: assigned });
      }
      used.push(name);
      if (!assigned) continue;
      p = skipSpace(p + 1);
      const quoted = text[p] === '"' || text[p] === "'";
      const valueStart = p + (quoted ? 1 : 0);
      const endValue = quoted ? stringEnd(p) : valueEnd(p, 'tag');
      if (fluid) add('value', valueStart, endValue, helper, syntax, used, { argument: name, quoted });
      p = endValue + (quoted && endValue < length ? 1 : 0);
    }
    return p;
  }

  let p = 0;
  while (p < length) {
    if (text.startsWith('<!--', p)) {
      const end = text.indexOf('-->', p + 4); p = end < 0 ? length : end + 3; continue;
    }
    if (/^<f:comment(?:\s|>)/.test(text.slice(p, p + 12))) {
      const openingEnd = text.indexOf('>', p);
      if (openingEnd >= 0 && text[openingEnd - 1] === '/') { p = openingEnd + 1; continue; }
      const end = text.indexOf('</f:comment>', p); p = end < 0 ? length : end + 12; continue;
    }
    if (text[p] === '<' && /^<\/?[a-zA-Z]/.test(text.slice(p, p + 4))) {
      const start = p;
      p = Math.max(tag(p), p + 1);
      // Do not mistake JS/CSS object literals and strings for Fluid calls.
      const raw = /^<(script|style)\b/i.exec(text.slice(start, p));
      if (raw) {
        const end = text.toLowerCase().indexOf('</' + raw[1].toLowerCase(), p);
        p = end < 0 ? length : end;
      }
      continue;
    }
    if (text[p] === '{') { p = expression(p + 1, '}'); continue; }
    p++;
  }
  return regions;
}

export function contextAt(regions: Region[], offset: number): Region | undefined {
  return regions.filter(r => r.start <= offset && offset <= r.end)
    .sort((a, b) => (a.end - a.start) - (b.end - b.start) || b.start - a.start)[0];
}

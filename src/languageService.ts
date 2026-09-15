import { Argument, catalog, ViewHelper } from './catalog';
import { contextAt, Region, scanFluid } from './fluidContext';

export interface Suggestion {
  label: string;
  insertText: string;
  snippet: boolean;
  start: number;
  end: number;
  kind: 'helper' | 'argument' | 'value';
  helper: string;
  argument?: string;
  detail: string;
  required?: boolean;
}
export interface Documentation {
  signature: string;
  description: string;
  url: string;
  arguments?: Record<string, Argument>;
  argument?: Argument;
}
export function documentation(helper: string, argument?: string): Documentation | undefined {
  const vh: ViewHelper | undefined = catalog[helper];
  if (!vh) return;
  const arg = argument ? vh.arguments[argument] : undefined;
  if (argument && !arg) return;
  return {
    signature: arg ? `${helper} · ${argument}: ${arg.type}` : helper,
    description: arg ? arg.description : vh.description,
    url: vh.documentation,
    ...(arg ? { argument: arg } : { arguments: vh.arguments })
  };
}

export function complete(text: string, offset: number, regions = scanFluid(text)): Suggestion[] {
  const context = contextAt(regions, offset);
  if (!context) return [];
  const { helper, syntax, kind } = context;
  if (kind === 'helper') {
    const prefix = text.slice(context.start, offset);
    return Object.keys(catalog).filter(name => name.startsWith(prefix)).map(name => {
      const addCall = syntax === 'inline' && !/^\s*\(/.test(text.slice(context.end));
      return {
        label: name, insertText: name + (addCall ? '($0)' : ''), snippet: addCall,
        start: context.start, end: context.end, kind, helper: name,
        detail: 'TYPO3 14.3 Fluid ViewHelper'
      };
    });
  }
  const vh = catalog[helper];
  if (!vh || syntax === 'closing') return [];
  if (kind === 'argument') {
    const prefix = /[\w]*$/.exec(text.slice(context.start, offset))![0];
    const start = offset - prefix.length;
    const end = offset + (/^\w*/.exec(text.slice(offset))![0].length);
    return Object.entries(vh.arguments)
      .filter(([name]) => name.startsWith(prefix) && (!context.used.includes(name) || name === context.argument))
      .map(([name, arg]) => {
        const insertion = syntax === 'tag' ? `${name}="$1"` : `${name}: ${inlinePlaceholder(arg)}`;
        return {
          label: name, insertText: context.hasAssignment ? name : insertion,
          snippet: !context.hasAssignment, start, end, kind, helper, argument: name,
          detail: `${arg.type}${arg.required ? ' (required)' : ''}`, required: arg.required
        };
      });
  }
  const arg = context.argument ? vh.arguments[context.argument] : undefined;
  if (!arg) return [];
  const values = arg.values ?? (/^(bool|boolean)$/.test(arg.type) ? ['true', 'false'] : []);
  const prefix = text.slice(context.start, offset);
  if (!/^[\w-]*$/.test(prefix)) return [];
  return values.filter(value => value.startsWith(prefix)).map(value => ({
    label: value, insertText: !context.quoted && syntax === 'inline' && arg.values ? `'${value}'` : value,
    snippet: false, start: context.start,
    end: offset + (/^[\w-]*/.exec(text.slice(offset))![0].length), kind, helper,
    argument: context.argument, detail: arg.type
  }));
}

function inlinePlaceholder(arg: Argument): string {
  if (arg.values) return "'${1|" + arg.values.join(',') + "|}'";
  if (/^(bool|boolean)$/.test(arg.type)) return '${1|true,false|}';
  if (/^(int|float|double)$/.test(arg.type)) return '${1:0}';
  if (arg.type === 'string') return "'$1'";
  return '${1:variable}';
}

export function hover(text: string, offset: number, regions = scanFluid(text)):
  { start: number; end: number; documentation: Documentation } | undefined {
  const context: Region | undefined = contextAt(regions, offset);
  if (!context || context.kind === 'value') return;
  const argument = context.kind === 'argument' ? context.argument : undefined;
  if (context.kind === 'argument' && !argument) return;
  const start = context.kind === 'helper' ? context.start : context.end - argument!.length;
  if (offset < start || offset >= context.end) return;
  const doc = documentation(context.helper, argument);
  return doc ? { start, end: context.end, documentation: doc } : undefined;
}

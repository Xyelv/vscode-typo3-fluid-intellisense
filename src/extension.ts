import * as vscode from 'vscode';
import { scanFluid, Region } from './fluidContext';
import { complete, documentation, Documentation, hover } from './languageService';

function markdown(doc: Documentation): vscode.MarkdownString {
  const result = new vscode.MarkdownString();
  result.appendCodeblock(doc.signature, 'text');
  result.appendText(doc.description);
  if (doc.argument) {
    result.appendMarkdown('\n\n');
    result.appendText(doc.argument.required ? 'Required argument.' : 'Optional argument.');
    if (doc.argument.default !== undefined) result.appendText(` Default: ${doc.argument.default}`);
  }
  if (doc.arguments && Object.keys(doc.arguments).length) {
    result.appendMarkdown('\n\n**Arguments**\n\n');
    for (const [name, arg] of Object.entries(doc.arguments)) {
      result.appendMarkdown('- ');
      result.appendText(`${name}: ${arg.type}${arg.required ? ' (required)' : ''}`);
      result.appendMarkdown('\n');
    }
  }
  result.appendMarkdown(`\n\n[TYPO3 14.3 documentation](${doc.url})`);
  return result;
}

export function activate(context: vscode.ExtensionContext): void {
  const cache = new WeakMap<vscode.TextDocument, { version: number; text: string; regions: Region[] }>();
  const state = (document: vscode.TextDocument) => {
    let entry = cache.get(document);
    if (!entry || entry.version !== document.version) {
      const text = document.getText();
      entry = { version: document.version, text, regions: scanFluid(text) };
      cache.set(document, entry);
    }
    return entry;
  };
  // Add to HTML support without replacing the built-in HTML language service.
  const selector = [{ language: 'html' }, { language: 'fluid' }, { language: 'typo3-fluid' }];
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(selector, {
      provideCompletionItems(document, position, token) {
        if (token.isCancellationRequested) return [];
        const { text, regions } = state(document);
        return complete(text, document.offsetAt(position), regions).map(suggestion => {
          const kind = suggestion.kind === 'helper' ? vscode.CompletionItemKind.Function :
            suggestion.kind === 'argument' ? vscode.CompletionItemKind.Property : vscode.CompletionItemKind.EnumMember;
          const item = new vscode.CompletionItem(suggestion.label, kind);
          item.range = new vscode.Range(document.positionAt(suggestion.start), document.positionAt(suggestion.end));
          item.insertText = suggestion.snippet ? new vscode.SnippetString(suggestion.insertText) : suggestion.insertText;
          item.detail = suggestion.detail;
          item.sortText = `${suggestion.required ? '0' : '1'}${suggestion.label}`;
          const doc = documentation(suggestion.helper, suggestion.argument);
          if (doc) item.documentation = markdown(doc);
          return item;
        });
      }
    }, ':', '.', ' ', '\n', '(', ',', '"', "'", '='),
    vscode.languages.registerHoverProvider(selector, {
      provideHover(document, position, token) {
        if (token.isCancellationRequested) return;
        const { text, regions } = state(document);
        const result = hover(text, document.offsetAt(position), regions);
        if (result) return new vscode.Hover(markdown(result.documentation),
          new vscode.Range(document.positionAt(result.start), document.positionAt(result.end)));
      }
    })
  );
}

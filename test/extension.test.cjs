const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const manifest = require('../package.json');

test('VS Code adapter registers providers, returns valid edits and refreshes after edits', () => {
  const registrations = {};
  class MarkdownString {
    value = '';
    appendText(value) { this.value += value; return this; }
    appendMarkdown(value) { this.value += value; return this; }
    appendCodeblock(value) { this.value += value; return this; }
  }
  class Range {
    constructor(start, end) { this.start = start; this.end = end; }
  }
  class SnippetString { constructor(value) { this.value = value; } }
  class CompletionItem { constructor(label, kind) { this.label = label; this.kind = kind; } }
  class Hover { constructor(contents, range) { this.contents = contents; this.range = range; } }
  const api = {
    MarkdownString, Range, SnippetString, CompletionItem, Hover,
    CompletionItemKind: { Function: 1, Property: 2, EnumMember: 3 },
    languages: {
      registerCompletionItemProvider(selector, provider, ...triggers) {
        registrations.completion = { selector, provider, triggers };
        return { dispose() {} };
      },
      registerHoverProvider(selector, provider) {
        registrations.hover = { selector, provider };
        return { dispose() {} };
      }
    }
  };
  const originalLoad = Module._load;
  Module._load = function (name, ...args) {
    return name === 'vscode' ? api : originalLoad.call(this, name, ...args);
  };
  let extension;
  try { extension = require('../' + manifest.main); } finally { Module._load = originalLoad; }
  const context = { subscriptions: [] };
  extension.activate(context);
  assert.equal(context.subscriptions.length, 2);
  assert.ok(registrations.completion.selector.some(s => s.language === 'html'));
  assert.ok(registrations.completion.triggers.includes(':'));
  let text = '<f:image\n  wi';
  const document = {
    version: 1,
    getText: () => text,
    offsetAt: position => text.split('\n').slice(0, position.line).reduce((n, l) => n + l.length + 1, 0) + position.character,
    positionAt(offset) {
      const lines = text.slice(0, offset).split('\n');
      return { line: lines.length - 1, character: lines.at(-1).length };
    }
  };
  const provider = registrations.completion.provider;
  const token = { isCancellationRequested: false };
  const position = document.positionAt(text.length);
  const items = provider.provideCompletionItems(document, position, token);
  const width = items.find(item => item.label === 'width');
  assert.ok(width);
  assert.equal(width.range.start.line, position.line);
  assert.equal(width.range.end.line, position.line);
  assert.equal(width.insertText.value, 'width="$1"');
  assert.ok(width.documentation.value.includes('TYPO3 14.3 documentation'));
  text = '<f:image src="test.jpg" width="80" ';
  document.version++;
  assert.ok(!provider.provideCompletionItems(document, document.positionAt(text.length), token)
    .some(item => item.label === 'width'));
  const result = registrations.hover.provider.provideHover(document, document.positionAt(4), token);
  assert.ok(result.contents.value.includes('f:image'));
  assert.deepEqual(provider.provideCompletionItems(document, position, { isCancellationRequested: true }), []);
});

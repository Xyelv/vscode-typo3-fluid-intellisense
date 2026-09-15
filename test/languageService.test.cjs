const { test } = require('node:test');
const assert = require('node:assert/strict');
const { complete, hover } = require('../out/src/languageService');
const { catalog } = require('../out/src/catalog');

function at(source, operation = complete) {
  const offset = source.indexOf('|');
  assert.notEqual(offset, -1, 'test needs a cursor');
  return operation(source.replace('|', ''), offset);
}
const labels = source => at(source).map(item => item.label);
const has = (source, label) => assert.ok(labels(source).includes(label), `${source}: missing ${label}`);

test('tag and inline helper names, including dotted prefixes', () => {
  has('<f:|', 'f:image');
  has('<f:uri.| />', 'f:uri.resource');
  has('{f:|}', 'f:render.text');
  has('{value -> f:format.|}', 'f:format.json');
  has('</f:im|>', 'f:image');
  has('<f:comment /><f:|', 'f:image');
});
test('replacement ranges replace the complete name without duplicating suffixes', () => {
  const item = at('<f:im|age />').find(item => item.label === 'f:image');
  assert.ok(item);
  assert.equal(item.start, 1);
  assert.equal(item.end, 8);
  assert.equal(item.insertText, 'f:image');
  const call = at('{f:uri.im|age(src: image)}').find(item => item.label === 'f:uri.image');
  assert.equal(call.insertText, 'f:uri.image');
  assert.equal(at('{f:uri.im|}')[0].insertText, 'f:uri.image($0)');
});
test('multiline attributes exclude those already present, including after cursor', () => {
  const source = '<f:image\n src="file.jpg"\n | height="40" />';
  has(source, 'width');
  assert.ok(!labels(source).includes('src'));
  assert.ok(!labels(source).includes('height'));
  const width = at(source).find(item => item.label === 'width');
  assert.equal(width.start, source.indexOf('|'));
  assert.equal(width.insertText, 'width="$1"');
});
test('editing an assigned attribute keeps its value', () => {
  const item = at('<f:image wi|dth="100" />').find(item => item.label === 'width');
  assert.equal(item.insertText, 'width');
  assert.equal(item.snippet, false);
});
test('inline arguments use Fluid syntax and exclude supplied arguments', () => {
  const source = '{f:image(src: image, |)}';
  has(source, 'width');
  assert.ok(!labels(source).includes('src'));
  assert.equal(at(source).find(item => item.label === 'width').insertText, "width: '$1'");
});
test('nested calls and maps retain the correct argument owner', () => {
  has('{f:render(arguments: {image: f:uri.image(|)}, partial: "Card")}', 'src');
  assert.ok(!labels('{f:render(arguments: {image: f:uri.image(|)})}').includes('partial'));
  has('{f:render(arguments: {image: f:uri.image(src: image)}, |)}', 'partial');
  assert.deepEqual(labels('{f:render(arguments: {someKey: |})}'), []);
});
test('nested Fluid in HTML attributes', () => {
  has('<img src="{f:uri.im|}" />', 'f:uri.image');
  has('<f:image src="{f:uri.resource(pa|)}" />', 'path');
});
test('greater-than signs and commas in quoted values do not end a context', () => {
  has('<f:if condition="{a > b}" |>', 'then');
  has("{f:render(partial: 'a,b', |)}", 'arguments');
  has("{f:render(partial: 'a\\\'b', |)}", 'arguments');
});
test('enumerated and boolean values', () => {
  has('<f:format.case mode="ca|">', 'capitalWords');
  has("{f:format.case(mode: 'ca|')}", 'capital');
  assert.equal(at('{f:format.case(mode: ca|)}')[0].insertText, "'capital'");
  has('<f:image absolute="|" />', 'true');
  assert.deepEqual(labels('<f:image src="|" />'), []);
});
test('unrelated HTML, text, comments, script and style do not get Fluid suggestions', () => {
  for (const source of [
    '<img |>', 'hello f:|', '<!-- <f:| -->', '<f:comment><f:|</f:comment>',
    '<script>const s = "<f:|";</script>', '<style>.x { f:| }</style>',
    '<custom:image |>', '<div title="f:|">', '{object.f:|}'
  ]) assert.deepEqual(labels(source), [], source);
});
test('hover resolves helpers and argument types for both syntaxes', () => {
  const helper = at('<f:im|age src="foo" />', hover);
  assert.equal(helper.documentation.signature, 'f:image');
  assert.ok(helper.documentation.url.endsWith('/Global/Image.html'));
  const attribute = at('<f:image\n wi|dth="40" />', hover);
  assert.equal(attribute.documentation.argument.type, 'string');
  const argument = at('{f:uri.image(sr|c: image)}', hover);
  assert.equal(argument.documentation.signature, 'f:uri.image · src: string');
  assert.equal(at('<div width="|40">', hover), undefined);
});
test('catalog includes TYPO3 14.3 additions and no removed ViewHelpers', () => {
  assert.ok(Object.keys(catalog).length >= 100);
  assert.ok(catalog['f:render.contentArea']);
  assert.ok(catalog['f:render.text'].arguments.field.required);
  assert.equal(catalog['f:base'], undefined);
  assert.equal(catalog['f:cache.warmup'], undefined);
  assert.equal(catalog['f:uri.email'], undefined);
  assert.ok(catalog['f:image'].arguments.src.description.length > 20);
  assert.equal(catalog['f:image'].arguments.src.default, "''");
  assert.equal(catalog['f:argument'].arguments.default.default, undefined);
  for (const helper of Object.values(catalog)) {
    assert.ok(helper.documentation.startsWith('https://docs.typo3.org/'));
    for (const arg of Object.values(helper.arguments)) assert.ok(arg.type);
  }
});

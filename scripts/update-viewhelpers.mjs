import { load } from 'cheerio';
import { writeFile } from 'node:fs/promises';

const base = 'https://docs.typo3.org/other/typo3/view-helper-reference/14.3/en-us/';
async function page(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`${response.status}: ${url}`);
  return load(await response.text());
}
const clean = text => text.replace(/\s+/g, ' ').replace(/¶|/g, '').trim();
if (process.argv.includes('--inspect')) {
  const $ = await page(base + 'Global/Image.html');
  const section = $('h3').filter((_, h) => clean($(h).text()) === 'src').closest('section, .section');
  console.log(section.html());
  process.exit(0);
}
const index = await page(base + 'Index.html');
const urls = [...new Set(index('a[href]').toArray().map(a => index(a).attr('href'))
  .filter(href => /^Global\/.*\.html$/.test(href)).map(href => base + href))];
const helpers = {};
let next = 0;
await Promise.all(Array.from({ length: 5 }, async () => {
  while (next < urls.length) {
    const url = urls[next++];
    const $ = await page(url);
    const heading = $('h1').first();
    const name = /<\s*(f:[\w.]+)\s*>/.exec(heading.text())?.[1];
    if (!name) continue; // Category pages do not describe a ViewHelper.
    const root = heading.closest('section, .section');
    const scope = root.length ? root : $('main, article').first();
    const args = {};
    scope.find('h3').each((_, element) => {
      const h = $(element);
      const arg = clean(h.text());
      if (!/^[a-zA-Z]\w*$/.test(arg)) return;
      const section = h.closest('section, .section');
      const definitions = {};
      section.find('dl.field-list > dt').each((_, dt) => {
        definitions[clean($(dt).text()).toLowerCase()] = clean($(dt).next('dd').text());
      });
      if (!definitions.type) return;
      const description = clean(section.find('.confval-description').first().text()).slice(0, 350);
      args[arg] = {
        type: definitions.type,
        required: definitions.required === '1' || definitions.required === 'true',
        description,
        ...(definitions.default !== undefined ? { default: definitions.default } : {})
      };
    });
    helpers[name] = {
      description: clean(scope.children('p').filter((_, p) => {
        const t = clean($(p).text());
        return t && !/^(Go to the source|New in version|Deprecated|Changed in version)/.test(t);
      }).first().text()).slice(0, 350) || `${name} ViewHelper`,
      documentation: url,
      arguments: args
    };
    console.log(`${name}: ${Object.keys(args).length} arguments`);
  }
}));
// Enumerations are curated because the documentation describes them in prose.
const choices = {
  'f:format.case': { mode: ['lower', 'upper', 'capital', 'uncapital', 'capitalWords'] },
  'f:form.button': { type: ['submit', 'button', 'reset'] },
  'f:page.meta': { type: ['name', 'property', 'http-equiv'] }
};
for (const [helper, arguments_] of Object.entries(choices)) {
  for (const [arg, values] of Object.entries(arguments_)) {
    if (helpers[helper]?.arguments[arg]) helpers[helper].arguments[arg].values = values;
  }
}
if (Object.keys(helpers).length < 70 || !helpers['f:image']?.arguments.src ||
    !helpers['f:render.text']?.arguments.field) {
  throw new Error('Incomplete documentation import; existing catalog was not changed.');
}
const catalog = {
  version: '14.3',
  source: base + 'Index.html',
  license: 'CC-BY-4.0',
  attribution: 'TYPO3 contributors; descriptions shortened and value suggestions added.',
  viewhelpers: Object.fromEntries(Object.entries(helpers).sort(([a], [b]) => a.localeCompare(b)))
};
await writeFile(new URL('../data/viewhelpers.json', import.meta.url), JSON.stringify(catalog, null, 2) + '\n');
console.log(`Saved ${Object.keys(helpers).length} ViewHelpers for TYPO3 14.3.`);

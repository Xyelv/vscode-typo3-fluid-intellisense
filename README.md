# TYPO3 Fluid IntelliSense

ViewHelper completion, argument suggestions, hover documentation and snippets for **TYPO3 14.3** in VS Code.

## Features

- Type `<f:` or `{f:` to browse 126 built-in ViewHelpers.
- Complete dotted names such as `f:uri.` and `f:render.`.
- Get argument suggestions inside tags and inline calls, including multiline tags and nested calls.
- Arguments already supplied are omitted. Required arguments appear first.
- Get boolean values and selected value lists, such as `f:format.case` modes.
- Hover over a ViewHelper or argument for its description, type, required status, default value and official documentation link.
- Keep using snippet shortcuts such as `fImage` and `fRenderText`.

The extension adds providers to HTML files and to the `fluid` and `typo3-fluid` language modes when another extension registers them. It preserves VS Code's built-in HTML support. In other file types, select **HTML** using the language mode in the status bar.

Use **Ctrl+Space** to request suggestions manually, including inside quoted attribute values if your editor disables automatic suggestions in strings.

### Examples

```html
<f:image src="fileadmin/example.jpg" width="800" />
<f:render.contentArea contentArea="{content.main}" />
{record -> f:render.text(field: 'bodytext')}
```

Completion and hover work offline using bundled metadata from the [official TYPO3 14.3 ViewHelper reference](https://docs.typo3.org/other/typo3/view-helper-reference/14.3/en-us/Index.html).

### Scope

This version supports the built-in `f:` namespace. It does not yet discover custom PHP ViewHelpers, namespace aliases, project variables, partial files or sections. The scanner tolerates incomplete input but is not a full Fluid parser or runtime validator. It suppresses suggestions in HTML/Fluid comments and in script/style bodies. HTML attributes such as `class` remain the responsibility of HTML completion; the metadata lists registered ViewHelper arguments.

## Requirements

- VS Code 1.85 or newer.
- TYPO3 14.3 is the metadata target; some suggestions are unavailable in earlier TYPO3 versions.
- PHP and a local TYPO3 installation are not required for completion or hover.

## Development

Use Node.js 20.13 or newer and npm:

```sh
npm ci
npm test
```

After building with `npm test` or `npm run compile`, press **F5** in VS Code to open an Extension Development Host. Open an HTML file there and try `<f:`, `<f:image ` and `{f:uri.image(`, then hover over a helper or argument. F5 uses the existing build; run `npm run watch` while changing TypeScript code.

```sh
npm run compile             # Build TypeScript and copy the metadata
npm run watch               # Rebuild during development
npm run update:viewhelpers  # Refresh metadata from the TYPO3 14.3 documentation
```

The tests cover completion contexts, replacement ranges, nested expressions, comments, hover and metadata. They run independently of the VS Code UI; use the Development Host for interactive checks.

The extension entry point is `src/extension.ts`. Context scanning is in `src/fluidContext.ts`; completion and hover logic is in `src/languageService.ts`. Metadata is stored in `data/viewhelpers.json` and updated with `scripts/update-viewhelpers.mjs`.

## License

Extension code: [MIT](LICENSE).

Bundled documentation excerpts: TYPO3 contributors, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Descriptions have been shortened and selected value lists added. See [data attribution](data/README.md).

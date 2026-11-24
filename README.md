# `@devstreamby/document-preview`

Opaque Vivliostyle CoreViewer preview session for product SPAs.

**License: AGPL-3.0** (see `LICENSE`, `NOTICE`). Depends on `@vivliostyle/core` `2.46.0` (shipped as a package dependency — consumers do not need a direct Core entry in their `package.json`).

## Public API

```ts
import {
  loadDocumentPreview,
  type PreviewSession,
} from "@devstreamby/document-preview";

const session = await loadDocumentPreview(
  iframe,
  { htmlContent },
  { userAgentRootURL: `${basePath}/vivliostyle/resources/` },
);

session.goToPage(2);
session.print();
session.dispose();
```

- Blank host iframe (app-owned static HTML) must contain `#vivliostyle-viewer-viewport`.
- Does **not** export `CoreViewer` or other `@vivliostyle/core` types.
- Product chrome (modal, i18n, UI kit) stays in the consuming app.

## HTML document contract

`loadDocumentPreview` expects a **full HTML document string** (ideally with `<!DOCTYPE html>`). Before CoreViewer load, the package prepares the HTML and, after layout, fills running / pagination / signature slots.

Use CSS paged media (`@page`, `position: running()`, margin boxes) as with Vivliostyle. On top of that, mark structure with the classes/attributes below so package adapters can find content.

### 1. Document roots and grouping

Wrap each logical document (or use body as fallback):

| Marker | Role |
| --- | --- |
| `[data-document-id]` or `.document` | Document root. Running slots without a group are hoisted to the start of this root. |
| `.document_{id}` | Optional class mirror of the document id (also used when resolving pages for signatures). |
| `[data-document-group-key]` | Groups pages for **pagination** (page N of M **within the group**). |
| `[data-document-subgroup-key]` | Subgroup root for **group running** slots; group runners are moved to the start of this element. |

```html
<div class="document document_abc" data-document-id="abc" data-document-group-key="report-1">
  <div data-document-subgroup-key="section-a">
    <!-- subgroup content + optional group running slots -->
  </div>
</div>
```

### 2. Running slots (headers / footers / margin content)

Use class `running-slot` for elements that participate in `position: running()` / margin-box fill.

**Document-level** (no group) — apply on every page of the document:

```html
<div
  class="running-slot"
  data-running-type="header"
  style="position: running(header)">
  Document title
</div>
```

The package **hoists** these to the beginning of `[data-document-id]` / `.document` so running() works from the first page.

**Group-level** — different content per subgroup:

```html
<div
  class="running-slot"
  data-running-type="group"
  data-running-group="section-a"
  style="position: running(groupFooter)">
  Section A
</div>
```

Rules:

- Prefer both `data-running-group` and a parent `[data-document-subgroup-key]` with the **same key**.
- `data-running-type="group"` is treated as a group slot even without `data-running-group` if the slot sits under `[data-document-subgroup-key]`.
- After layout, group HTML is copied into matching pages (including `bottom-left` margin box when type is `group`).

### 3. Pagination slots

```html
<span
  class="pagination-slot"
  data-pagination-mode="no-first"
  data-pagination-template="Page [[pageNumber]] / [[pageTotal]]">
  Page [[pageNumber]] / [[pageTotal]]
</span>
```

| Piece | Meaning |
| --- | --- |
| `.pagination-slot` | Slot to fill after layout. |
| `[[pageNumber]]` / `[[pageTotal]]` | Placeholders replaced with 1-based indices. |
| `data-pagination-template` | Optional; stored so re-fills keep the template. |
| `data-pagination-mode="no-first"` | Hide pagination on the first page of the group (slot removed / bottom-right cleared). |

Numbering:

- Pages with the same `[data-document-group-key]` share one N/M sequence.
- Pages without a group key are numbered together as one sequence.

If a page has a Vivliostyle `bottom-right` margin box and no in-box `.pagination-slot`, the package may inject a slot there using the first `.pagination-slot` template from the source HTML (fallback text: `Page [[pageNumber]]`).

### 4. Page signatures (footers injected after layout)

Declare signatures in source HTML; they are **removed before layout**, then injected onto the last fitting page of that document:

```html
<div
  class="page-signature"
  data-signature-document="abc"
  data-signature-real-margin-bottom="15mm"
  data-signature-layout-margin-bottom="42mm">
  <div class="signature-footer">…</div>
</div>
```

| Attribute | Required | Default | Meaning |
| --- | --- | --- | --- |
| `.page-signature` | yes | — | Signature block to extract. |
| `data-signature-document` | yes | — | Must match `data-document-id` / `.document_{id}`. |
| `data-signature-real-margin-bottom` | no | `15mm` | Bottom margin after inject. |
| `data-signature-layout-margin-bottom` | no | `42mm` | Extra space reserved during layout. |

One signature source per `data-signature-document` (first wins). Inner markup is preserved when re-injected (for example `.signature-footer` / flex footer wrappers used by the host app).

### 5. Minimal skeleton

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <style>
    @page {
      size: A4;
      margin: 15mm;
      @bottom-left { content: element(groupFooter); }
      @bottom-right { content: element(pageNumber); }
    }
    .running-slot[data-running-type="group"] {
      position: running(groupFooter);
    }
    .pagination-slot {
      position: running(pageNumber);
    }
  </style>
</head>
<body>
  <div class="document document_abc" data-document-id="abc" data-document-group-key="report-1">
    <div class="running-slot" data-running-type="header" style="position: running(docHeader)">
      Report title
    </div>

    <div data-document-subgroup-key="section-a">
      <div
        class="running-slot"
        data-running-type="group"
        data-running-group="section-a">
        Section A
      </div>
      <table>…</table>
    </div>

    <span class="pagination-slot">Page [[pageNumber]] / [[pageTotal]]</span>

    <div class="page-signature" data-signature-document="abc">
      <div class="signature-footer">Signed…</div>
    </div>
  </div>
</body>
</html>
```

Wire `@page` margin boxes / `element(...)` names to your own `position: running(...)` identifiers; the package does not invent `@page` rules — it only **moves and fills** marked slots after Vivliostyle lays out pages.

### 6. What the package does not own

- Product React chrome, i18n, routing.
- Generating report HTML (templates stay in the app).
- Blank-host URL / CSP nonce exclusion / `userAgentRootURL` (pass from the app).
- Product-specific enrichment (QR, domain widgets, etc.) — emit final HTML into `htmlContent`.

## Host / CSP checklist

1. Serve an app-owned blank host whose body contains `<div id="vivliostyle-viewer-viewport"></div>`.
2. Point the preview iframe `src` at that host (same origin).
3. Pass `userAgentRootURL` ending with `/` (for example `${basePath}/vivliostyle/resources/`).
4. On nonce CSP hosts, exclude the blank-host path from style-nonce injection and allow `connect-src` `data:` / `blob:` as required by Vivliostyle.

## Develop / publish

Public GitHub repository (AGPL-3.0). CI: GitHub Actions. Registry: GitHub Packages. See [docs/SETUP.md](docs/SETUP.md).

```bash
npm install
npm run typecheck
npm run build
```

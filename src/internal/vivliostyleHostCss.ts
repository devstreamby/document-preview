/** Host-document CSS for the Vivliostyle preview iframe (viewer DOM). */

import {
    OUTER_ZOOM_BOX_SELECTOR,
    PAGE_CONTAINER_SELECTOR,
    PRINT_PAGE_ATTR,
    PRINT_PAGE_LAST_ATTR,
    PRINT_PAGE_SKIP_ATTR,
    SPREAD_CONTAINER_SELECTOR,
    UNPAIRED_PAGE_ATTR,
    VIEWER_VIEWPORT_ID,
    VIEWER_VIEWPORT_SELECTOR,
} from "./vivliostyleDom";

/**
 * Scrollable multi-page stack on screen (CoreViewer stays SINGLE_PAGE).
 * Do not override Vivliostyle transform/zoom — that breaks page scale.
 */
export const VIVLIOSTYLE_HOST_SCREEN_STACK_CSS = `
@media screen {
  html,
  body {
    height: 100% !important;
    max-height: 100% !important;
    overflow: hidden !important;
    min-height: 0 !important;
  }

  #${VIEWER_VIEWPORT_ID},
  ${VIEWER_VIEWPORT_SELECTOR} {
    height: 100% !important;
    max-height: 100% !important;
    overflow: auto !important;
    padding: 16px 24px !important;
    box-sizing: border-box !important;
  }

  /*
   * Vivliostyle model: spread is unscaled + transform:scale(--viv-outputScale);
   * outer-zoom-box must be sized to scaled bounds (see CoreViewer.zoom).
   */
  ${OUTER_ZOOM_BOX_SELECTOR} {
    overflow: hidden !important;
    min-height: 0 !important;
    margin-left: auto !important;
    margin-right: auto !important;
  }

  ${VIEWER_VIEWPORT_SELECTOR} ${SPREAD_CONTAINER_SELECTOR} {
    display: flex !important;
    flex-direction: column !important;
    align-items: center !important;
    justify-content: flex-start !important;
    height: auto !important;
    min-height: 0 !important;
    width: max-content !important;
    gap: 24px;
    padding: 0 !important;
    margin: 0 !important;
    transform-origin: left top !important;
  }

  ${PAGE_CONTAINER_SELECTOR} {
    display: block !important;
    visibility: visible !important;
    position: relative !important;
    left: auto !important;
    top: auto !important;
    right: auto !important;
    bottom: auto !important;
    margin-left: auto !important;
    margin-right: auto !important;
    background: #fff;
    flex: none !important;
  }

  ${PAGE_CONTAINER_SELECTOR}[${UNPAIRED_PAGE_ATTR}="true"] {
    display: none !important;
  }
}
`.trim();

/**
 * `@media print` for already-paginated sheets. Neutralize publication
 * `page-break-*` inside containers or the browser appends a blank trailing page.
 */
export const VIVLIOSTYLE_HOST_PRINT_CSS = `
@media print {
  html,
  body {
    margin: 0 !important;
    padding: 0 !important;
    width: auto !important;
    height: auto !important;
    max-height: none !important;
    overflow: visible !important;
    background: none !important;
    display: block !important;
    --viv-outputScale: 1 !important;
  }

  #${VIEWER_VIEWPORT_ID},
  ${VIEWER_VIEWPORT_SELECTOR} {
    width: auto !important;
    height: auto !important;
    max-height: none !important;
    overflow: visible !important;
    padding: 0 !important;
    transform: none !important;
    zoom: 1 !important;
    --viv-outputScale: 1 !important;
  }

  ${OUTER_ZOOM_BOX_SELECTOR},
  ${SPREAD_CONTAINER_SELECTOR} {
    width: auto !important;
    height: auto !important;
    max-width: none !important;
    max-height: none !important;
    overflow: visible !important;
    transform: none !important;
    zoom: 1 !important;
    gap: 0 !important;
    margin: 0 !important;
    padding: 0 !important;
  }

  ${SPREAD_CONTAINER_SELECTOR} {
    display: block !important;
    flex-direction: column !important;
    align-items: stretch !important;
  }

  ${PAGE_CONTAINER_SELECTOR}[${PRINT_PAGE_SKIP_ATTR}] {
    display: none !important;
  }

  ${PAGE_CONTAINER_SELECTOR}[${PRINT_PAGE_ATTR}] {
    display: block !important;
    visibility: visible !important;
    position: relative !important;
    left: auto !important;
    top: auto !important;
    float: none !important;
    overflow: hidden !important;
    page-break-inside: avoid !important;
    break-inside: avoid !important;
    page-break-after: always !important;
    break-after: page !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  ${PAGE_CONTAINER_SELECTOR}[${PRINT_PAGE_LAST_ATTR}] {
    page-break-after: avoid !important;
    break-after: avoid !important;
  }

  ${PAGE_CONTAINER_SELECTOR}[${PRINT_PAGE_ATTR}] .document,
  ${PAGE_CONTAINER_SELECTOR}[${PRINT_PAGE_ATTR}] .page-break-before,
  ${PAGE_CONTAINER_SELECTOR}[${PRINT_PAGE_ATTR}] .page-break-after {
    page-break-before: auto !important;
    page-break-after: auto !important;
    break-before: auto !important;
    break-after: auto !important;
  }
}
`.trim();

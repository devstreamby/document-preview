import {
    getPageContainers,
    MARGIN_BOX_BOTTOM_RIGHT_SELECTOR,
    PAGE_AREA_CONTAINER_SELECTOR,
    PAGE_AREA_SELECTOR,
    PAGE_COLUMN_SELECTOR,
    PAGE_MARGIN_BOX_ATTR,
    PAGE_MARGIN_BOX_SELECTOR,
    parseHtmlDocument,
    resolvePageDocumentId,
} from "./vivliostyleDom";

export type VivliostyleSignatureSource = {
    documentId: string;
    html: string;
    realMarginBottom: string;
    layoutMarginBottom: string;
};

const INJECTED_SIGNATURE_CLASS = "injected-signature";
const DEFAULT_LAYOUT_MARGIN_BOTTOM = "42mm";
const DEFAULT_REAL_MARGIN_BOTTOM = "15mm";
const MARGIN_SHRUNK_ATTR = "data-signature-margin-shrunk";
const BOTTOM_MARGIN_BOX_NAMES = new Set([
    "bottom-left-corner",
    "bottom-left",
    "bottom-center",
    "bottom-right",
    "bottom-right-corner",
]);

const SIGNATURE_ANCHOR_SELECTOR = [
    "table",
    "thead",
    "tbody",
    "tfoot",
    "tr",
    "p",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "ul",
    "ol",
    "li",
    "img",
    "pre",
    "blockquote",
].join(",");

const INJECTED_SIGNATURE_VIEW_CSS = `
.injected-signature-host {
  display: block;
  position: static;
  box-sizing: border-box;
  width: 100%;
  pointer-events: none;
}
.injected-signature-host .injected-signature,
.injected-signature-host .signature-footer {
  position: static !important;
  margin-top: 0;
  font-size: 10pt;
  width: 100%;
  box-sizing: border-box;
}
.injected-signature-host .weighing-protocol-footer {
  display: flex !important;
  flex-direction: row !important;
  justify-content: space-between !important;
  align-items: flex-start !important;
  margin-top: 24px;
  font-size: 10pt;
}
.injected-signature-host .signatures-container {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}
.injected-signature-host .left-signatures {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.injected-signature-host .signature-row {
  display: flex;
  align-items: flex-end;
  gap: 32px;
}
.injected-signature-host .signature-label {
  display: inline-block;
  flex-shrink: 0;
  flex-basis: 140px;
  width: 140px;
  white-space: nowrap;
  font-size: 12pt;
}
.injected-signature-host .signature-name {
  display: inline-block;
  flex-shrink: 0;
  flex-basis: 120px;
}
.injected-signature-host .signature-spacer {
  flex: 0 0 80%;
  box-sizing: border-box;
}
.injected-signature-host .signature-line-group {
  display: flex;
  align-items: flex-end;
  gap: 24px;
  flex-shrink: 0;
}
.injected-signature-host .signature-line {
  width: 100px;
  min-height: 1em;
  border-bottom: 1px solid #000;
  display: inline-block;
}
.injected-signature-host .judges-section {
  display: flex;
  align-items: flex-start;
  gap: 40px;
  justify-content: space-between;
}
.injected-signature-host .judges-label {
  white-space: nowrap;
}
.injected-signature-host .judges-signatures {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.injected-signature-host .judge-signature-line {
  width: 150px;
  border-bottom: 1px solid #000;
  display: inline-block;
}
.pagination-slot,
${MARGIN_BOX_BOTTOM_RIGHT_SELECTOR} {
  font-size: 10pt;
  text-align: center;
}
`.trim();

const INJECTED_SIGNATURE_STYLE_ID = "vivliostyle-injected-signature-styles";

export const extractSignatureSources = (sourceHtml: string): VivliostyleSignatureSource[] => {
    const doc = parseHtmlDocument(sourceHtml);
    const sources: VivliostyleSignatureSource[] = [];
    const seen = new Set<string>();

    const signatures = Array.from(doc.querySelectorAll<HTMLElement>(".page-signature"));
    for (const signature of signatures) {
        const documentId = signature.getAttribute("data-signature-document");
        if (!documentId || seen.has(documentId)) {
            continue;
        }
        seen.add(documentId);
        sources.push({
            documentId,
            html: signature.outerHTML,
            realMarginBottom: signature.getAttribute("data-signature-real-margin-bottom") || DEFAULT_REAL_MARGIN_BOTTOM,
            layoutMarginBottom:
                signature.getAttribute("data-signature-layout-margin-bottom") || DEFAULT_LAYOUT_MARGIN_BOTTOM,
        });
    }

    return sources;
};

export const preparePageSignaturesForLayout = (doc: Document): void => {
    for (const signature of Array.from(doc.querySelectorAll<HTMLElement>(".page-signature"))) {
        signature.remove();
    }
};

export const ensureInjectedSignatureViewStyles = (previewDocument: Document): void => {
    if (previewDocument.getElementById(INJECTED_SIGNATURE_STYLE_ID)) {
        return;
    }
    const styleEl = previewDocument.createElement("style");
    styleEl.id = INJECTED_SIGNATURE_STYLE_ID;
    styleEl.textContent = INJECTED_SIGNATURE_VIEW_CSS;
    (previewDocument.head || previewDocument.documentElement).appendChild(styleEl);
};

export const clearInjectedSignatures = (previewDocument: Document): void => {
    previewDocument
        .querySelectorAll(`.${INJECTED_SIGNATURE_CLASS}-host, .${INJECTED_SIGNATURE_CLASS}`)
        .forEach((node) => node.remove());
};

const lengthToPx = (previewDocument: Document, length: string): number => {
    const probe = previewDocument.createElement("div");
    probe.style.cssText = `position:absolute;visibility:hidden;height:${length};width:0;`;
    previewDocument.body.appendChild(probe);
    const px = probe.offsetHeight;
    probe.remove();
    return px;
};

const growElementHeight = (element: HTMLElement, deltaPx: number): void => {
    if (deltaPx <= 0) {
        return;
    }
    const fromStyle = Number.parseFloat(element.style.height);
    const current = Number.isFinite(fromStyle) && fromStyle > 0 ? fromStyle : element.getBoundingClientRect().height;
    element.style.height = `${current + deltaPx}px`;
};

const shrinkBottomMarginAfterLayout = (
    page: HTMLElement,
    previewDocument: Document,
    source: VivliostyleSignatureSource,
): void => {
    if (page.getAttribute(MARGIN_SHRUNK_ATTR) === "1") {
        return;
    }

    const layoutPx = lengthToPx(previewDocument, source.layoutMarginBottom);
    const realPx = lengthToPx(previewDocument, source.realMarginBottom);
    const deltaPx = Math.max(0, layoutPx - realPx);
    if (deltaPx <= 0) {
        page.setAttribute(MARGIN_SHRUNK_ATTR, "1");
        return;
    }

    const area = page.querySelector<HTMLElement>(PAGE_AREA_SELECTOR);
    const areaContainer = page.querySelector<HTMLElement>(PAGE_AREA_CONTAINER_SELECTOR);
    const column = page.querySelector<HTMLElement>(PAGE_COLUMN_SELECTOR);

    if (area) {
        growElementHeight(area, deltaPx);
    }
    if (areaContainer) {
        growElementHeight(areaContainer, deltaPx);
    }
    if (column) {
        growElementHeight(column, deltaPx);
    }

    const bottomBoxes = Array.from(page.querySelectorAll<HTMLElement>(PAGE_MARGIN_BOX_SELECTOR)).filter((box) =>
        BOTTOM_MARGIN_BOX_NAMES.has(box.getAttribute(PAGE_MARGIN_BOX_ATTR) || ""),
    );

    for (const box of bottomBoxes) {
        const top = Number.parseFloat(box.style.top);
        if (Number.isFinite(top)) {
            box.style.top = `${top + deltaPx}px`;
        }
        const height = Number.parseFloat(box.style.height);
        if (Number.isFinite(height) && height > realPx) {
            box.style.height = `${realPx}px`;
        }
    }

    page.setAttribute(MARGIN_SHRUNK_ATTR, "1");
    void page.offsetHeight;
};

const buildSignatureHost = (previewDocument: Document, source: VivliostyleSignatureSource): HTMLElement => {
    const parseWrap = previewDocument.createElement("div");
    parseWrap.innerHTML = source.html.trim();
    const signature = parseWrap.firstElementChild as HTMLElement | null;
    if (!signature) {
        throw new Error(`Invalid page-signature HTML for document ${source.documentId}`);
    }

    signature.classList.add(INJECTED_SIGNATURE_CLASS);
    signature.style.position = "static";
    signature.style.removeProperty("display");
    signature.style.marginTop = "0";

    const host = previewDocument.createElement("div");
    host.className = `document_${source.documentId} ${INJECTED_SIGNATURE_CLASS}-host`;
    host.setAttribute("data-document-id", source.documentId);
    host.style.display = "block";
    host.style.position = "static";
    host.style.boxSizing = "border-box";
    host.style.width = "100%";
    host.style.marginTop = "0";
    host.style.pointerEvents = "none";
    host.appendChild(signature);

    return host;
};

const unlockOverflow = (element: HTMLElement | null): void => {
    if (!element) {
        return;
    }
    element.style.overflow = "visible";
};

const resolveSignatureContentRoot = (page: HTMLElement, documentId: string): HTMLElement | null =>
    page.querySelector<HTMLElement>("[data-document-group-key]") ||
    page.querySelector<HTMLElement>(`[data-document-id="${documentId}"]`) ||
    page.querySelector<HTMLElement>(".document") ||
    page.querySelector<HTMLElement>(`.document_${documentId}`);

const placeHostBelowPageContent = (mountParent: HTMLElement, host: HTMLElement): void => {
    host.style.marginTop = "0";
    mountParent.appendChild(host);

    const parentRect = mountParent.getBoundingClientRect();
    let contentBottom = parentRect.top;

    const anchors = Array.from(mountParent.querySelectorAll<HTMLElement>(SIGNATURE_ANCHOR_SELECTOR));
    const candidates = anchors.length > 0 ? anchors : Array.from(mountParent.querySelectorAll<HTMLElement>("*"));

    for (const el of candidates) {
        if (host === el || host.contains(el)) {
            continue;
        }
        const rect = el.getBoundingClientRect();
        if (rect.height <= 0 || rect.width <= 0) {
            continue;
        }
        if (parentRect.height > 0 && rect.height >= parentRect.height * 0.85) {
            continue;
        }
        contentBottom = Math.max(contentBottom, rect.bottom);
    }

    const hostTop = host.getBoundingClientRect().top;
    const gapPx = Math.max(0, contentBottom - hostTop + 8);
    host.style.marginTop = `${gapPx}px`;
};

export const injectSignatures = (previewDocument: Document, sources: VivliostyleSignatureSource[]): void => {
    if (sources.length === 0) {
        return;
    }

    ensureInjectedSignatureViewStyles(previewDocument);

    const byDocumentId = new Map(sources.map((source) => [source.documentId, source]));
    const fallbackIds = sources.map((source) => source.documentId);
    const pages = getPageContainers(previewDocument);

    for (const page of pages) {
        if (page.querySelector(`.${INJECTED_SIGNATURE_CLASS}-host, .${INJECTED_SIGNATURE_CLASS}`)) {
            continue;
        }

        const area = page.querySelector<HTMLElement>(PAGE_AREA_SELECTOR);
        if (!area) {
            continue;
        }

        const documentId = resolvePageDocumentId(page, fallbackIds);
        if (!documentId || !byDocumentId.has(documentId)) {
            continue;
        }

        const source = byDocumentId.get(documentId)!;
        shrinkBottomMarginAfterLayout(page, previewDocument, source);

        const contentRoot = resolveSignatureContentRoot(page, documentId);
        if (!contentRoot) {
            continue;
        }

        unlockOverflow(page);
        unlockOverflow(page.querySelector<HTMLElement>("[data-vivliostyle-bleed-box]"));
        unlockOverflow(page.querySelector<HTMLElement>("[data-vivliostyle-page-box]"));
        unlockOverflow(page.querySelector<HTMLElement>(PAGE_AREA_CONTAINER_SELECTOR));
        unlockOverflow(area);
        unlockOverflow(page.querySelector<HTMLElement>(PAGE_COLUMN_SELECTOR));
        unlockOverflow(contentRoot);

        placeHostBelowPageContent(contentRoot, buildSignatureHost(previewDocument, source));
    }
};

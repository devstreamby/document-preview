/** Vivliostyle viewer / page DOM contract (attrs + selectors shared across libs). */

export const VIEWER_VIEWPORT_ID = "vivliostyle-viewer-viewport";
export const VIEWER_VIEWPORT_SELECTOR = `[data-vivliostyle-viewer-viewport]`;

export const OUTER_ZOOM_BOX_SELECTOR = "[data-vivliostyle-outer-zoom-box]";
export const SPREAD_CONTAINER_SELECTOR = "[data-vivliostyle-spread-container]";

export const PAGE_CONTAINER_ATTR = "data-vivliostyle-page-container";
export const PAGE_CONTAINER_SELECTOR = `[${PAGE_CONTAINER_ATTR}]`;

export const PAGE_AREA_ATTR = "data-vivliostyle-page-area";
export const PAGE_AREA_SELECTOR = `[${PAGE_AREA_ATTR}]`;

export const PAGE_AREA_CONTAINER_ATTR = "data-vivliostyle-page-area-container";
export const PAGE_AREA_CONTAINER_SELECTOR = `[${PAGE_AREA_CONTAINER_ATTR}]`;

export const PAGE_COLUMN_ATTR = "data-vivliostyle-column";
export const PAGE_COLUMN_SELECTOR = `[${PAGE_COLUMN_ATTR}]`;

export const PAGE_MARGIN_BOX_ATTR = "data-vivliostyle-page-margin-box";
export const PAGE_MARGIN_BOX_SELECTOR = `[${PAGE_MARGIN_BOX_ATTR}]`;
export const MARGIN_BOX_BOTTOM_LEFT_SELECTOR = `[${PAGE_MARGIN_BOX_ATTR}="bottom-left"]`;
export const MARGIN_BOX_BOTTOM_RIGHT_SELECTOR = `[${PAGE_MARGIN_BOX_ATTR}="bottom-right"]`;

export const UNPAIRED_PAGE_ATTR = "data-vivliostyle-unpaired-page";
export const PAGE_SIDE_ATTR = "data-vivliostyle-page-side";
export const PAGE_INDEX_ATTR = "data-vivliostyle-page-index";

export const PRINT_SURFACE_STYLE_ATTR = "data-vivliostyle-print-surface";
export const PRINT_PAGE_ATTR = "data-vivliostyle-print-page";
export const PRINT_PAGE_LAST_ATTR = "data-vivliostyle-print-page-last";
export const PRINT_PAGE_SKIP_ATTR = "data-vivliostyle-print-page-skip";

export const parseHtmlDocument = (html: string): Document => new DOMParser().parseFromString(html, "text/html");

export const getPageContainers = (previewDocument: Document): HTMLElement[] =>
    Array.from(previewDocument.querySelectorAll<HTMLElement>(PAGE_CONTAINER_SELECTOR));

export const resolvePageGroupKey = (page: HTMLElement): string | null =>
    page.querySelector<HTMLElement>("[data-document-group-key]")?.getAttribute("data-document-group-key") ?? null;

export const resolvePageSubGroupKey = (page: HTMLElement): string | null =>
    page.querySelector<HTMLElement>("[data-document-subgroup-key]")?.getAttribute("data-document-subgroup-key") ?? null;

export const resolvePageDocumentId = (page: HTMLElement, fallbackDocumentIds: string[] = []): string | null => {
    const fromAttr = page.querySelector<HTMLElement>("[data-document-id]")?.getAttribute("data-document-id");
    if (fromAttr) {
        return fromAttr;
    }

    const documentRoot = page.querySelector<HTMLElement>(".document");
    if (documentRoot) {
        const idClass = Array.from(documentRoot.classList).find(
            (cls) => cls.startsWith("document_") && cls !== "document",
        );
        if (idClass) {
            return idClass.slice("document_".length) || null;
        }
    }

    const classToken = Array.from(page.classList).find((cls) => cls.startsWith("document_"));
    if (classToken) {
        return classToken.slice("document_".length) || null;
    }

    if (fallbackDocumentIds.length === 1) {
        return fallbackDocumentIds[0] ?? null;
    }

    return null;
};

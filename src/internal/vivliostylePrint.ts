import {
    OUTER_ZOOM_BOX_SELECTOR,
    PAGE_AREA_SELECTOR,
    PAGE_CONTAINER_SELECTOR,
    PAGE_SIDE_ATTR,
    PRINT_PAGE_ATTR,
    PRINT_PAGE_LAST_ATTR,
    PRINT_PAGE_SKIP_ATTR,
    PRINT_SURFACE_STYLE_ATTR,
    SPREAD_CONTAINER_SELECTOR,
    UNPAIRED_PAGE_ATTR,
} from "./vivliostyleDom";
import { VIVLIOSTYLE_HOST_PRINT_CSS } from "./vivliostyleHostCss";

export type VivliostylePrintResult = { ok: true; pageCount: number } | { ok: false; reason: string };

const isSkippablePrintPage = (element: HTMLElement): boolean => {
    if (element.hasAttribute(UNPAIRED_PAGE_ATTR)) {
        return true;
    }

    // Facing-page placeholders in spread layout.
    if (element.getAttribute(PAGE_SIDE_ATTR) && !element.querySelector(PAGE_AREA_SELECTOR)) {
        return true;
    }

    const area = element.querySelector(PAGE_AREA_SELECTOR);
    if (!area) {
        return true;
    }

    const hasDocument = Boolean(
        element.querySelector("[data-document-id], [data-document-group-key], .document, table, img"),
    );
    if (hasDocument) {
        return false;
    }

    const text = (area.textContent || "").replace(/\s+/g, " ").trim();
    return text.length < 2;
};
const countPrintablePageContainers = (doc: Document): number => {
    const marked = doc.querySelectorAll(`${PAGE_CONTAINER_SELECTOR}[${PRINT_PAGE_ATTR}]`).length;
    if (marked > 0) {
        return marked;
    }
    return Array.from(doc.querySelectorAll<HTMLElement>(PAGE_CONTAINER_SELECTOR)).filter(
        (element) => !isSkippablePrintPage(element),
    ).length;
};

/**
 * Mark printable pages, hide empty/unpaired sheets, force visibility for print dialog,
 * then restore previous inline display / markers on `afterprint`.
 */
type PreviousPageStyle = {
    element: HTMLElement;
    display: string;
    overflow: string;
    width: string;
    height: string;
};

type PreviousImportantBoxStyle = {
    element: HTMLElement;
    width: string;
    widthPriority: string;
    height: string;
    heightPriority: string;
    overflow: string;
    overflowPriority: string;
    maxWidth: string;
    maxWidthPriority: string;
    maxHeight: string;
    maxHeightPriority: string;
};

const snapshotImportantBoxStyle = (element: HTMLElement): PreviousImportantBoxStyle => ({
    element,
    width: element.style.getPropertyValue("width"),
    widthPriority: element.style.getPropertyPriority("width"),
    height: element.style.getPropertyValue("height"),
    heightPriority: element.style.getPropertyPriority("height"),
    overflow: element.style.getPropertyValue("overflow"),
    overflowPriority: element.style.getPropertyPriority("overflow"),
    maxWidth: element.style.getPropertyValue("max-width"),
    maxWidthPriority: element.style.getPropertyPriority("max-width"),
    maxHeight: element.style.getPropertyValue("max-height"),
    maxHeightPriority: element.style.getPropertyPriority("max-height"),
});

const clearImportantBoxStyleForPrint = (element: HTMLElement): void => {
    // Screen-stack sets these with !important; stylesheet @media print cannot override them.
    element.style.removeProperty("width");
    element.style.removeProperty("height");
    element.style.removeProperty("overflow");
    element.style.removeProperty("max-width");
    element.style.removeProperty("max-height");
};


/** Apple WebKit print engine (Safari desktop + all iOS browsers). Blink/Chrome stays locked. */
const isWebKitPrintEngine = (frameWindow: Window): boolean => {
    const { userAgent, maxTouchPoints } = frameWindow.navigator;
    // iPadOS 13+ may report Macintosh in UA; all iOS browsers print through WebKit.
    const isIOS =
        /iPad|iPhone|iPod/i.test(userAgent) ||
        (/\bMacintosh\b/i.test(userAgent) && maxTouchPoints > 1);
    if (isIOS) {
        return true;
    }
    // Desktop Safari only — Chromium UAs also contain "Safari".
    return /Safari/i.test(userAgent) && !/Chrome|Chromium|CriOS|Edg|OPR|Firefox|FxiOS/i.test(userAgent);
};

const restoreImportantBoxStyle = (snapshot: PreviousImportantBoxStyle): void => {
    const { element } = snapshot;
    if (snapshot.width) {
        element.style.setProperty("width", snapshot.width, snapshot.widthPriority || undefined);
    }
    if (snapshot.height) {
        element.style.setProperty("height", snapshot.height, snapshot.heightPriority || undefined);
    }
    if (snapshot.overflow) {
        element.style.setProperty("overflow", snapshot.overflow, snapshot.overflowPriority || undefined);
    }
    if (snapshot.maxWidth) {
        element.style.setProperty("max-width", snapshot.maxWidth, snapshot.maxWidthPriority || undefined);
    }
    if (snapshot.maxHeight) {
        element.style.setProperty("max-height", snapshot.maxHeight, snapshot.maxHeightPriority || undefined);
    }
};

const prepareIframePrintSurface = (frameWindow: Window, frameDocument: Document): (() => void) => {
    const previousStyles: PreviousPageStyle[] = [];
    const previousBoxStyles: PreviousImportantBoxStyle[] = [];
    const markedPages: HTMLElement[] = [];

    const zoomBox = frameDocument.querySelector<HTMLElement>(OUTER_ZOOM_BOX_SELECTOR);
    const spread = frameDocument.querySelector<HTMLElement>(SPREAD_CONTAINER_SELECTOR);
    for (const element of [zoomBox, spread]) {
        if (!element) {
            continue;
        }
        previousBoxStyles.push(snapshotImportantBoxStyle(element));
        clearImportantBoxStyleForPrint(element);
    }

    const containers = Array.from(frameDocument.querySelectorAll<HTMLElement>(PAGE_CONTAINER_SELECTOR));
    const printable = containers.filter((element) => !isSkippablePrintPage(element));

    containers.forEach((element) => {
        previousStyles.push({
            element,
            display: element.style.display,
            overflow: element.style.overflow,
            width: element.style.width,
            height: element.style.height,
        });
        element.removeAttribute(PRINT_PAGE_ATTR);
        element.removeAttribute(PRINT_PAGE_LAST_ATTR);
        element.removeAttribute(PRINT_PAGE_SKIP_ATTR);

        if (!printable.includes(element)) {
            element.setAttribute(PRINT_PAGE_SKIP_ATTR, "true");
            element.style.display = "none";
            return;
        }

        element.setAttribute(PRINT_PAGE_ATTR, "true");
        markedPages.push(element);

        // Lock unscaled layout box (offset*), not scaled getBoundingClientRect — screen preview is scaled.
        if (!element.style.width && element.offsetWidth > 0) {
            element.style.width = `${element.offsetWidth}px`;
        }
        if (!element.style.height && element.offsetHeight > 0) {
            element.style.height = `${element.offsetHeight}px`;
        }
        // Chrome: overflow hidden = one sheet per page. WebKit: same box, visible to avoid mid-row clip.
        element.style.overflow = isWebKitPrintEngine(frameWindow) ? "visible" : "hidden";

        if (frameWindow.getComputedStyle(element).display === "none") {
            element.style.display = "block";
        }
    });

    const lastPrintable = markedPages[markedPages.length - 1];
    if (lastPrintable) {
        lastPrintable.setAttribute(PRINT_PAGE_LAST_ATTR, "true");
        lastPrintable.style.setProperty("page-break-after", "avoid", "important");
        lastPrintable.style.setProperty("break-after", "avoid", "important");
    }

    let styleElement = frameDocument.querySelector<HTMLStyleElement>(`style[${PRINT_SURFACE_STYLE_ATTR}]`);
    let createdStyle = false;
    if (!styleElement) {
        styleElement = frameDocument.createElement("style");
        styleElement.setAttribute(PRINT_SURFACE_STYLE_ATTR, "true");
        styleElement.textContent = VIVLIOSTYLE_HOST_PRINT_CSS;
        frameDocument.head.appendChild(styleElement);
        createdStyle = true;
    } else {
        // Host may have been created before CSS updates — refresh rules.
        styleElement.textContent = VIVLIOSTYLE_HOST_PRINT_CSS;
    }

    const restore = () => {
        previousStyles.forEach(({ element, display, overflow, width, height }) => {
            element.style.display = display;
            element.style.overflow = overflow;
            element.style.width = width;
            element.style.height = height;
            element.style.removeProperty("page-break-after");
            element.style.removeProperty("break-after");
            element.removeAttribute(PRINT_PAGE_ATTR);
            element.removeAttribute(PRINT_PAGE_LAST_ATTR);
            element.removeAttribute(PRINT_PAGE_SKIP_ATTR);
        });
        previousBoxStyles.forEach(restoreImportantBoxStyle);
        if (createdStyle) {
            styleElement?.remove();
        }
    };

    const onAfterPrint = () => {
        cleanup();
    };

    const mediaQuery = frameWindow.matchMedia?.("print");
    const onMediaChange = (event: MediaQueryListEvent) => {
        if (!event.matches) {
            cleanup();
        }
    };

    let cleaned = false;
    const cleanup = () => {
        if (cleaned) {
            return;
        }
        cleaned = true;
        frameWindow.removeEventListener("afterprint", onAfterPrint);
        mediaQuery?.removeEventListener?.("change", onMediaChange);
        restore();
    };

    frameWindow.addEventListener("afterprint", onAfterPrint);
    mediaQuery?.addEventListener?.("change", onMediaChange);

    // Safety net if the browser never fires afterprint (some WebKit builds).
    frameWindow.setTimeout(cleanup, 120_000);

    return cleanup;
};

/** Print the laid-out CoreViewer iframe (all pages). */
export const printVivliostyleIframe = (iframe: HTMLIFrameElement): VivliostylePrintResult => {
    const frameWindow = iframe.contentWindow;
    const frameDocument = iframe.contentDocument;
    if (!frameWindow || !frameDocument) {
        return { ok: false, reason: "Vivliostyle preview iframe has no contentWindow/contentDocument" };
    }

    let restorePrintSurface: (() => void) | null = null;
    try {
        restorePrintSurface = prepareIframePrintSurface(frameWindow, frameDocument);
        const pageCount = countPrintablePageContainers(frameDocument);
        if (pageCount < 1) {
            restorePrintSurface();
            return { ok: false, reason: "No Vivliostyle page containers ready for print" };
        }
        frameWindow.print();
        return { ok: true, pageCount };
    } catch (error) {
        restorePrintSurface?.();
        return {
            ok: false,
            reason: error instanceof Error ? error.message : String(error),
        };
    }
};

import type {
    PreviewLoadInput,
    PreviewLoadOptions,
    PreviewPageNav,
    PreviewPrintResult,
    PreviewSession,
} from "../types";
import { mountVivliostyleCoreViewer } from "./vivliostyleCoreViewerHost";
import {
    OUTER_ZOOM_BOX_SELECTOR,
    PAGE_CONTAINER_SELECTOR,
    PAGE_INDEX_ATTR,
    SPREAD_CONTAINER_SELECTOR,
    UNPAIRED_PAGE_ATTR,
    VIEWER_VIEWPORT_ID,
} from "./vivliostyleDom";
import { prepareVivliostyleReportHtml } from "./vivliostylePrepareHtml";
import { printVivliostyleIframe } from "./vivliostylePrint";
import { mountVivliostyleUxAdapters, type VivliostyleUxAdapterHandle } from "./vivliostyleUxAdapters";

const toPageNav = (epage: number, epageCount: number): PreviewPageNav => ({
    epage,
    epageCount,
    first: epage <= 1,
    last: epageCount <= 0 || epage >= epageCount,
});

const listPrintablePages = (doc: Document): HTMLElement[] =>
    Array.from(doc.querySelectorAll<HTMLElement>(PAGE_CONTAINER_SELECTOR)).filter(
        (element) => element.getAttribute(UNPAIRED_PAGE_ATTR) !== "true",
    );

/**
 * Vivliostyle keeps the spread at unscaled layout size and paints it with
 * `transform: scale(var(--viv-outputScale))`. CoreViewer.zoom sizes outer-zoom-box
 * to the *scaled* page — we do the same for the full stacked column so the
 * scrollport ends at the last sheet (no empty canvas).
 */
const fixStackedPreviewScrollTail = (iframe: HTMLIFrameElement): void => {
    const doc = iframe.contentDocument;
    const win = iframe.contentWindow;
    const viewport = doc?.getElementById(VIEWER_VIEWPORT_ID);
    const zoomBox = doc?.querySelector<HTMLElement>(OUTER_ZOOM_BOX_SELECTOR);
    const spread = doc?.querySelector<HTMLElement>(SPREAD_CONTAINER_SELECTOR);
    if (!doc || !win || !viewport || !zoomBox || !spread) {
        return;
    }

    if (listPrintablePages(doc).length === 0) {
        return;
    }

    // Undo earlier experiments; never override spread transform (Vivliostyle CSS).
    zoomBox.style.removeProperty("zoom");
    zoomBox.style.removeProperty("margin-bottom");
    if (zoomBox.style.transform === "none" || zoomBox.style.getPropertyPriority("transform") === "important") {
        zoomBox.style.removeProperty("transform");
    }
    if (spread.style.transform === "none" || spread.style.getPropertyPriority("transform") === "important") {
        spread.style.removeProperty("transform");
    }

    // Measure stacked spread at full layout, then size zoom box to the painted (scaled) box.
    zoomBox.style.setProperty("width", "auto", "important");
    zoomBox.style.setProperty("height", "auto", "important");
    zoomBox.style.setProperty("overflow", "visible", "important");
    spread.style.setProperty("height", "auto", "important");
    spread.style.setProperty("width", "max-content", "important");
    void spread.offsetHeight;

    const painted = spread.getBoundingClientRect();
    if (painted.width <= 0 || painted.height <= 0) {
        return;
    }

    zoomBox.style.setProperty("width", `${Math.ceil(painted.width)}px`, "important");
    zoomBox.style.setProperty("height", `${Math.ceil(painted.height)}px`, "important");
    zoomBox.style.setProperty("overflow", "hidden", "important");
};

/**
 * Keep outer-zoom-box sized to the painted (scaled) spread.
 * Uses rAF + ResizeObserver instead of fixed timeout retries.
 */
const attachStackedPreviewScrollTailFix = (iframe: HTMLIFrameElement): (() => void) => {
    const frameWindow = iframe.contentWindow as (Window & typeof globalThis) | null;
    const doc = iframe.contentDocument;
    if (!frameWindow || !doc) {
        return () => undefined;
    }

    let frame = 0;
    const scheduleFix = () => {
        if (frame) {
            return;
        }
        frame = frameWindow.requestAnimationFrame(() => {
            frame = 0;
            fixStackedPreviewScrollTail(iframe);
        });
    };

    scheduleFix();

    const viewport = doc.getElementById(VIEWER_VIEWPORT_ID);
    const spread = doc.querySelector<HTMLElement>(SPREAD_CONTAINER_SELECTOR);
    const resizeObserver =
        typeof frameWindow.ResizeObserver === "function" ? new frameWindow.ResizeObserver(scheduleFix) : null;

    // Do not observe outer-zoom-box — we resize it in the fix and would loop.
    for (const target of [viewport, spread]) {
        if (target) {
            resizeObserver?.observe(target);
        }
    }

    frameWindow.addEventListener("resize", scheduleFix);

    return () => {
        if (frame) {
            frameWindow.cancelAnimationFrame(frame);
        }
        resizeObserver?.disconnect();
        frameWindow.removeEventListener("resize", scheduleFix);
    };
};

/**
 * Scroll the sheet for 1-based epage into the iframe viewport.
 * Prefer viewport `scrollTop` over `scrollIntoView`: pages live under
 * `transform: scale(...)`, and scrollIntoView uses layout boxes that break the
 * stacked scroll range (toolbar jump to N can make pages 1..N-1 unreachable).
 */
const scrollPageIntoView = (iframe: HTMLIFrameElement, epage: number): void => {
    const doc = iframe.contentDocument;
    const viewport = doc?.getElementById(VIEWER_VIEWPORT_ID);
    if (!doc || !viewport || epage < 1) {
        return;
    }

    const zeroBasedIndex = epage - 1;
    const byIndex = doc.querySelector<HTMLElement>(
        `${PAGE_CONTAINER_SELECTOR}[${PAGE_INDEX_ATTR}="${zeroBasedIndex}"]`,
    );
    const page =
        byIndex && byIndex.getAttribute(UNPAIRED_PAGE_ATTR) !== "true"
            ? byIndex
            : listPrintablePages(doc)[zeroBasedIndex];
    if (!page) {
        return;
    }

    const viewportRect = viewport.getBoundingClientRect();
    const pageRect = page.getBoundingClientRect();
    const nextTop = viewport.scrollTop + (pageRect.top - viewportRect.top);
    const maxTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
    viewport.scrollTop = Math.min(Math.max(0, nextTop), maxTop);
};

/**
 * Sync toolbar page number while the user scrolls the stacked pages.
 */
const attachScrollPageNav = (
    iframe: HTMLIFrameElement,
    pageCount: number,
    onChange: (nav: PreviewPageNav) => void,
): (() => void) => {
    const doc = iframe.contentDocument;
    const viewport = doc?.getElementById(VIEWER_VIEWPORT_ID);
    if (!doc || !viewport) {
        return () => undefined;
    }

    let frame = 0;
    const updateFromScroll = () => {
        const pages = listPrintablePages(doc);
        if (pages.length === 0) {
            return;
        }

        const viewportTop = viewport.getBoundingClientRect().top;
        const probeY = viewportTop + Math.min(80, viewport.clientHeight * 0.15);
        let bestIndex = 0;
        let bestDistance = Number.POSITIVE_INFINITY;

        pages.forEach((page, index) => {
            const rect = page.getBoundingClientRect();
            const distance = Math.abs(rect.top - probeY);
            if (rect.bottom > viewportTop && distance < bestDistance) {
                bestDistance = distance;
                bestIndex = index;
            }
        });

        const epage = bestIndex + 1;
        onChange(toPageNav(epage, pageCount || pages.length));
    };

    const onScroll = () => {
        if (frame) {
            return;
        }
        frame =
            iframe.contentWindow?.requestAnimationFrame(() => {
                frame = 0;
                updateFromScroll();
            }) ?? 0;
    };

    viewport.addEventListener("scroll", onScroll, { passive: true });
    updateFromScroll();

    return () => {
        viewport.removeEventListener("scroll", onScroll);
        if (frame && iframe.contentWindow) {
            iframe.contentWindow.cancelAnimationFrame(frame);
        }
    };
};
/**
 * Mount CoreViewer into the preview iframe and wire load / ready / error / print.
 * Returns an opaque session — CoreViewer is not exposed.
 */
export const loadDocumentPreview = async (
    iframe: HTMLIFrameElement,
    input: PreviewLoadInput,
    options: PreviewLoadOptions,
): Promise<PreviewSession> => {
    if (!input.htmlContent) {
        throw new Error("Document preview requires non-empty htmlContent");
    }

    const preparedHtml = prepareVivliostyleReportHtml(input.htmlContent);
    const { host, result } = await mountVivliostyleCoreViewer(iframe, preparedHtml, options.userAgentRootURL);
    const pageCount = result.pageCount ?? 0;

    if (result.status === "error") {
        host.dispose();
        throw new Error(result.errorMessage ?? "Vivliostyle CoreViewer failed to load document");
    }

    const previewDocument = iframe.contentDocument;
    if (!previewDocument) {
        host.dispose();
        throw new Error("Document preview iframe lost contentDocument after load");
    }

    let uxAdapters: VivliostyleUxAdapterHandle | null = mountVivliostyleUxAdapters({
        viewer: host.viewer,
        previewDocument,
        sourceHtml: input.htmlContent,
    });

    let latestNav: PreviewPageNav = toPageNav(1, pageCount);
    const navListeners = new Set<(nav: PreviewPageNav) => void>();
    let syncingFromToolbar = false;

    const publishNav = (nav: PreviewPageNav) => {
        if (
            latestNav.epage === nav.epage &&
            latestNav.epageCount === nav.epageCount &&
            latestNav.first === nav.first &&
            latestNav.last === nav.last
        ) {
            return;
        }
        latestNav = nav;
        navListeners.forEach((listener) => listener(latestNav));
    };

    const detachScrollTailFix = attachStackedPreviewScrollTailFix(iframe);

    const detachScrollNav = attachScrollPageNav(iframe, pageCount, (nav) => {
        if (syncingFromToolbar) {
            return;
        }
        publishNav(nav);
    });

    const session: PreviewSession = {
        getPageNav: () => latestNav,
        subscribeNav: (listener) => {
            navListeners.add(listener);
            return () => {
                navListeners.delete(listener);
            };
        },
        navigate: (direction) => {
            const total = Math.max(pageCount, latestNav.epageCount, 1);
            const nextEpage =
                direction === "previous" ? Math.max(1, latestNav.epage - 1) : Math.min(total, latestNav.epage + 1);
            session.goToPage(nextEpage);
        },
        goToPage: (epage) => {
            const total = Math.max(pageCount, latestNav.epageCount, 1);
            const clamped = Math.min(Math.max(1, Math.round(epage) || 1), total);
            syncingFromToolbar = true;
            publishNav(toPageNav(clamped, total));
            // Keep zoom-box metrics stable before scrolling; height:auto mid-scroll clips the stack.
            fixStackedPreviewScrollTail(iframe);
            scrollPageIntoView(iframe, clamped);
            window.setTimeout(() => {
                syncingFromToolbar = false;
            }, 100);
        },
        print: (): PreviewPrintResult => {
            if (result.status !== "ready") {
                return {
                    ok: false,
                    reason: "Document preview is not ready for print (CoreViewer not loaded)",
                };
            }
            return printVivliostyleIframe(iframe);
        },
        dispose: () => {
            detachScrollTailFix();
            detachScrollNav();
            navListeners.clear();
            uxAdapters?.dispose();
            uxAdapters = null;
            host.dispose();
        },
    };

    return session;
};

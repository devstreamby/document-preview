import type { PreviewPrintResult } from "../types";

/** True on iPhone / iPad / iPod (incl. iPadOS desktop-UA mode). */
export const isIOSClient = (clientWindow: Window): boolean => {
    const { userAgent, maxTouchPoints } = clientWindow.navigator;
    return (
        /iPad|iPhone|iPod/i.test(userAgent) ||
        (/\bMacintosh\b/i.test(userAgent) && maxTouchPoints > 1)
    );
};

const CONTENT_READY_DELAY_MS = 100;
const CONTENT_READY_FALLBACK_MS = 600;
const CLOSE_POLL_MS = 400;
const SESSION_TTL_MS = 120_000;

type IosPrintSession = {
    dispose: () => void;
    start: () => void;
};

/**
 * Platform adapter for iOS print.
 *
 * Constraint: `iframe.contentWindow.print()` prints the parent Admin UI, not the preview.
 * Strategy: open a same-gesture blob tab with the prepared document, print there, then
 * dismiss the tab when the system print sheet ends (afterprint is unreliable on iOS).
 */
const createIosPrintSession = (
    printWindow: Window,
    openerWindow: Window,
    objectUrl: string,
): IosPrintSession => {
    const disposers: Array<() => void> = [];
    let disposed = false;
    let printRequested = false;

    const dispose = (): void => {
        if (disposed) {
            return;
        }
        disposed = true;
        while (disposers.length > 0) {
            disposers.pop()?.();
        }
        try {
            printWindow.close();
        } catch {
            // Window may already be closed by the browser.
        }
        URL.revokeObjectURL(objectUrl);
        try {
            openerWindow.focus();
        } catch {
            // Focus return is best-effort on iOS.
        }
    };

    const trackTimeout = (handle: number): void => {
        disposers.push(() => printWindow.clearTimeout(handle));
    };

    const trackInterval = (handle: number): void => {
        disposers.push(() => printWindow.clearInterval(handle));
    };

    const trackListener = (
        target: Window | MediaQueryList,
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: AddEventListenerOptions,
    ): void => {
        target.addEventListener(type, listener, options);
        disposers.push(() => target.removeEventListener(type, listener, options));
    };

    const documentHasContent = (): boolean =>
        Boolean(printWindow.document.body && printWindow.document.body.childElementCount > 0);

    const watchForPrintSheetDismissal = (): void => {
        // iOS ignores close() while the print sheet is open; polling succeeds after dismiss.
        trackInterval(
            printWindow.setInterval(() => {
                if (printWindow.closed) {
                    dispose();
                    return;
                }
                try {
                    printWindow.close();
                } catch {
                    // ignore
                }
            }, CLOSE_POLL_MS),
        );
    };

    const requestPrint = (): void => {
        if (disposed || printRequested || !documentHasContent()) {
            return;
        }
        printRequested = true;
        try {
            printWindow.focus();
            printWindow.print();
        } catch {
            // User can still use the system share/print UI on the opened tab.
        }
        watchForPrintSheetDismissal();
    };

    const start = (): void => {
        trackListener(printWindow, "afterprint", () => dispose());
        trackListener(openerWindow, "focus", () => dispose());

        const printMedia = printWindow.matchMedia?.("print");
        if (printMedia && "addEventListener" in printMedia) {
            trackListener(printMedia, "change", ((event: MediaQueryListEvent) => {
                if (!event.matches) {
                    dispose();
                }
            }) as EventListener);
        }

        // Blob navigation starts as about:blank; wait for the real document load.
        trackListener(
            printWindow,
            "load",
            () => {
                trackTimeout(printWindow.setTimeout(requestPrint, CONTENT_READY_DELAY_MS));
            },
            { once: true },
        );
        trackTimeout(
            printWindow.setTimeout(() => {
                if (!printRequested) {
                    requestPrint();
                }
            }, CONTENT_READY_FALLBACK_MS),
        );
        trackTimeout(printWindow.setTimeout(dispose, SESSION_TTL_MS));
    };

    return { start, dispose };
};

/** Print a prepared Vivliostyle preview document on iOS via a blob tab. */
export const printIosPreparedDocument = (
    frameDocument: Document,
    openerWindow: Window,
    pageCount: number,
): PreviewPrintResult => {
    const html = `<!DOCTYPE html>${frameDocument.documentElement.outerHTML}`;
    const objectUrl = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    const printWindow = openerWindow.open(objectUrl, "_blank");
    if (!printWindow) {
        URL.revokeObjectURL(objectUrl);
        return {
            ok: false,
            reason: "Popup blocked — allow popups to print this document on iOS",
        };
    }

    createIosPrintSession(printWindow, openerWindow, objectUrl).start();
    return { ok: true, pageCount };
};

import type { PreviewPrintResult } from "../types";
import { VIEWER_VIEWPORT_ID, VIEWER_VIEWPORT_SELECTOR } from "./vivliostyleDom";

/** True on iPhone / iPad / iPod (incl. iPadOS desktop-UA mode). */
export const isIOSClient = (clientWindow: Window): boolean => {
    const { userAgent, maxTouchPoints } = clientWindow.navigator;
    return (
        /iPad|iPhone|iPod/i.test(userAgent) ||
        (/\bMacintosh\b/i.test(userAgent) && maxTouchPoints > 1)
    );
};

/**
 * Only unlocks the screen-stack viewport lock. Sheet / page-break rules stay in the
 * host print CSS already injected by prepareIframePrintSurface.
 */
const IOS_VIEWPORT_UNLOCK_CSS = `
html, body,
#${VIEWER_VIEWPORT_ID},
${VIEWER_VIEWPORT_SELECTOR} {
  height: auto !important;
  max-height: none !important;
  overflow: visible !important;
}
`.trim();

/**
 * iOS cannot print the Vivliostyle iframe (prints parent Admin UI).
 * Open a blob snapshot in a new tab and print that document.
 */
export const printIosPreparedDocument = (
    frameDocument: Document,
    openerWindow: Window,
    pageCount: number,
): PreviewPrintResult => {
    const html = `<!DOCTYPE html>${frameDocument.documentElement.outerHTML}`.replace(
        /<\/head>/i,
        `<style data-vivliostyle-ios-viewport-unlock="true">${IOS_VIEWPORT_UNLOCK_CSS}</style></head>`,
    );
    const objectUrl = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    const printWindow = openerWindow.open(objectUrl, "_blank");
    if (!printWindow) {
        URL.revokeObjectURL(objectUrl);
        return {
            ok: false,
            reason: "Popup blocked — allow popups to print this document on iOS",
        };
    }

    let printed = false;
    let finished = false;
    let closePoll = 0;

    const finish = (): void => {
        if (finished) {
            return;
        }
        finished = true;
        if (closePoll) {
            printWindow.clearInterval(closePoll);
        }
        try {
            printWindow.close();
        } catch {
            // ignore
        }
        URL.revokeObjectURL(objectUrl);
        try {
            openerWindow.focus();
        } catch {
            // ignore
        }
    };

    const requestPrint = (): void => {
        if (printed || finished || !printWindow.document.body?.childElementCount) {
            return;
        }
        printed = true;
        try {
            printWindow.print();
        } catch {
            // User can still print manually from the opened tab.
        }
        // iOS often skips afterprint; close() is ignored while the sheet is open.
        closePoll = printWindow.setInterval(() => {
            if (printWindow.closed) {
                finish();
                return;
            }
            try {
                printWindow.close();
            } catch {
                // ignore
            }
        }, 500);
        printWindow.setTimeout(finish, 120_000);
    };

    printWindow.addEventListener(
        "load",
        () => {
            printWindow.setTimeout(requestPrint, 200);
        },
        { once: true },
    );
    printWindow.setTimeout(requestPrint, 1_200);
    printWindow.addEventListener("afterprint", finish, { once: true });

    return { ok: true, pageCount };
};

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

const buildIosPrintHtml = (frameDocument: Document): string =>
    `<!DOCTYPE html>${frameDocument.documentElement.outerHTML}`.replace(
        /<\/head>/i,
        `<style data-vivliostyle-ios-viewport-unlock="true">${IOS_VIEWPORT_UNLOCK_CSS}</style></head>`,
    );

/**
 * iOS cannot print the Vivliostyle iframe (prints parent Admin UI).
 *
 * Do not use `blob:` — under deployed SecurityHeaders the opener CSP (style nonce,
 * no unsafe-inline) and COOP make blob tabs unusable for print. Open the same-origin
 * preview host (style-nonce excluded) and replace it with the prepared snapshot.
 */
export const printIosPreparedDocument = (
    frameDocument: Document,
    openerWindow: Window,
    pageCount: number,
    previewHostUrl: string,
): PreviewPrintResult => {
    if (!previewHostUrl) {
        return {
            ok: false,
            reason: "iOS print needs the same-origin document-preview host URL",
        };
    }

    const html = buildIosPrintHtml(frameDocument);
    const printWindow = openerWindow.open(previewHostUrl, "_blank");
    if (!printWindow) {
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
        try {
            openerWindow.focus();
        } catch {
            // ignore
        }
    };

    const requestPrint = (): void => {
        if (printed || finished) {
            return;
        }
        try {
            printWindow.document.open();
            printWindow.document.write(html);
            printWindow.document.close();
        } catch {
            finish();
            return;
        }

        printed = true;
        printWindow.setTimeout(() => {
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
        }, 200);
    };

    printWindow.addEventListener("load", requestPrint, { once: true });
    printWindow.setTimeout(requestPrint, 1_500);
    printWindow.addEventListener("afterprint", finish, { once: true });

    return { ok: true, pageCount };
};

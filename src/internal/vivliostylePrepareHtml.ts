import { parseHtmlDocument } from "./vivliostyleDom";
import { hoistDocumentLevelRunningSlots, moveGroupRunningSlotsToSubgroupStart } from "./vivliostyleRunningSlots";
import { preparePageSignaturesForLayout } from "./vivliostyleSignatures";

/** Prepare report HTML before CoreViewer `loadDocument`. */
export const prepareVivliostyleReportHtml = (htmlContent: string): string => {
    if (!htmlContent.trim()) {
        throw new Error("Vivliostyle report HTML is empty");
    }

    const doc = parseHtmlDocument(htmlContent);
    hoistDocumentLevelRunningSlots(doc);
    moveGroupRunningSlotsToSubgroupStart(doc);
    preparePageSignaturesForLayout(doc);
    disableSafariTelephoneAutolinks(doc);

    const doctype = htmlContent.trimStart().toLowerCase().startsWith("<!doctype") ? "<!DOCTYPE html>\n" : "";
    return `${doctype}${doc.documentElement.outerHTML}`;
};

/**
 * iOS Safari turns phone-looking text into tel: / data-detector anchors (even via DOMParser).
 * Unwrap those links and disable format-detection so the blob document does not re-link them.
 */
const disableSafariTelephoneAutolinks = (doc: Document): void => {
    doc.querySelectorAll("a[href^='tel:'], a[x-apple-data-detectors]").forEach((anchor) => {
        const parent = anchor.parentNode;
        if (!parent) {
            return;
        }
        while (anchor.firstChild) {
            parent.insertBefore(anchor.firstChild, anchor);
        }
        parent.removeChild(anchor);
    });

    const head = doc.head ?? doc.documentElement.appendChild(doc.createElement("head"));
    let meta = head.querySelector('meta[name="format-detection"]');
    if (!meta) {
        meta = doc.createElement("meta");
        meta.setAttribute("name", "format-detection");
        head.appendChild(meta);
    }
    meta.setAttribute("content", "telephone=no,email=no,address=no");
};

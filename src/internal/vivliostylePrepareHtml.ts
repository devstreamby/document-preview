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

    const doctype = htmlContent.trimStart().toLowerCase().startsWith("<!doctype") ? "<!DOCTYPE html>\n" : "";
    return `${doctype}${doc.documentElement.outerHTML}`;
};

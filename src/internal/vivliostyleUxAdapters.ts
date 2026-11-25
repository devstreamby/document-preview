import type { CoreViewer, Payload } from "@vivliostyle/core";
import { extractPaginationTemplate, fillPaginationSlots } from "./vivliostylePagination";
import {
    extractGroupRunningSources,
    fillGroupRunningSlots,
    type VivliostyleGroupRunningSource,
} from "./vivliostyleRunningSlots";
import {
    clearInjectedSignatures,
    ensureInjectedSignatureViewStyles,
    ensureSourceDocumentStyles,
    extractSignatureSources,
    injectSignatures,
    type VivliostyleSignatureSource,
} from "./vivliostyleSignatures";

export type VivliostyleUxAdapterHandle = {
    dispose: () => void;
};

export type VivliostyleUxAdapterInput = {
    viewer: CoreViewer;
    previewDocument: Document;
    sourceHtml: string;
};

const INJECTED_SIGNATURE_HOST_SELECTOR = ".injected-signature-host";

const applyUxPasses = (
    previewDocument: Document,
    sourceHtml: string,
    signatureSources: VivliostyleSignatureSource[],
    groupRunningSources: VivliostyleGroupRunningSource[],
    paginationTemplate: string | null,
    force: boolean,
): void => {
    ensureSourceDocumentStyles(previewDocument, sourceHtml);
    ensureInjectedSignatureViewStyles(previewDocument);

    const hasInjectedSignatures = Boolean(previewDocument.querySelector(INJECTED_SIGNATURE_HOST_SELECTOR));
    // Browser zoom / autoResize re-fires "loaded". Skip wipe+reinject when hosts survived.
    if (force || !hasInjectedSignatures) {
        clearInjectedSignatures(previewDocument);
        injectSignatures(previewDocument, signatureSources);
    }

    fillGroupRunningSlots(previewDocument, groupRunningSources);
    fillPaginationSlots(previewDocument, paginationTemplate);
};

/** Run UX adapters when pagination completes (`loaded` / `paginationprogress`). */
export const mountVivliostyleUxAdapters = (input: VivliostyleUxAdapterInput): VivliostyleUxAdapterHandle => {
    const { viewer, previewDocument, sourceHtml } = input;
    if (!previewDocument) {
        throw new Error("Vivliostyle UX adapters require previewDocument");
    }
    if (!viewer) {
        throw new Error("Vivliostyle UX adapters require CoreViewer instance");
    }

    const signatureSources = extractSignatureSources(sourceHtml);
    const groupRunningSources = extractGroupRunningSources(sourceHtml);
    const paginationTemplate = extractPaginationTemplate(sourceHtml);
    let disposed = false;
    let scheduled = false;
    let applying = false;

    const runPass = (force: boolean) => {
        if (disposed || applying) {
            return;
        }
        applying = true;
        try {
            applyUxPasses(
                previewDocument,
                sourceHtml,
                signatureSources,
                groupRunningSources,
                paginationTemplate,
                force,
            );
        } finally {
            applying = false;
        }
    };

    const schedulePass = () => {
        if (disposed || scheduled) {
            return;
        }
        scheduled = true;
        void Promise.resolve().then(() => {
            scheduled = false;
            runPass(false);
        });
    };

    // Initial pass only — autoResize is off; do not re-run UX on browser zoom.
    runPass(true);

    const onPaginationProgress = (payload: Payload) => {
        const fraction = typeof payload.fraction === "number" ? payload.fraction : 0;
        if (fraction >= 1) {
            schedulePass();
        }
    };

    viewer.addListener("paginationprogress", onPaginationProgress);

    return {
        dispose: () => {
            disposed = true;
            viewer.removeListener("paginationprogress", onPaginationProgress);
        },
    };
};

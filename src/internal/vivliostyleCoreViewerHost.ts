import { CoreViewer, PageViewMode, type Payload } from "@vivliostyle/core";
import type { PreviewLoadResult } from "../types";
import { VIEWER_VIEWPORT_ID } from "./vivliostyleDom";
import { VIVLIOSTYLE_HOST_PRINT_CSS, VIVLIOSTYLE_HOST_SCREEN_STACK_CSS } from "./vivliostyleHostCss";

export type VivliostyleCoreViewerHost = {
    viewer: CoreViewer;
    documentBlobURL: string;
    dispose: () => void;
};

const HOST_STYLE_ELEMENT_ID = "vivliostyle-preview-host-css";

const VIEWER_OPTIONS = {
    renderAllPages: true,
    pageViewMode: PageViewMode.SINGLE_PAGE,
    fitToScreen: false,
    // Browser zoom must not re-layout fixed @page reports (flicker / single-page stack break).
    autoResize: false,
};

const waitForViewerReady = (viewer: CoreViewer): Promise<PreviewLoadResult> =>
    new Promise((resolve) => {
        const onLoaded = (_payload: Payload) => {
            cleanup();
            resolve({
                status: "ready",
                pageCount: viewer.getPageSizes()?.length ?? 0,
            });
        };

        const onError = (payload: Payload) => {
            cleanup();
            const error = payload?.content?.error;
            resolve({
                status: "error",
                errorMessage: error instanceof Error ? error.message : String(error ?? "CoreViewer error"),
            });
        };

        const cleanup = () => {
            viewer.removeListener("loaded", onLoaded);
            viewer.removeListener("error", onError);
        };

        viewer.addListener("loaded", onLoaded);
        viewer.addListener("error", onError);
    });

const waitForPreviewHostDocument = (iframe: HTMLIFrameElement): Promise<Document> =>
    new Promise((resolve, reject) => {
        const tryResolve = (): boolean => {
            const doc = iframe.contentDocument;
            if (!doc) {
                return false;
            }

            if (doc.readyState !== "complete" && doc.readyState !== "interactive") {
                return false;
            }

            if (!doc.getElementById(VIEWER_VIEWPORT_ID)) {
                return false;
            }

            resolve(doc);
            return true;
        };

        if (tryResolve()) {
            return;
        }

        const onLoad = () => {
            iframe.removeEventListener("load", onLoad);
            window.clearTimeout(timeoutId);
            if (!tryResolve()) {
                reject(new Error("Vivliostyle preview host document is missing viewport element"));
            }
        };

        const timeoutId = window.setTimeout(() => {
            iframe.removeEventListener("load", onLoad);
            reject(new Error("Timed out waiting for Vivliostyle preview host iframe"));
        }, 15000);

        iframe.addEventListener("load", onLoad);
    });

const ensureHostStyles = (frameDocument: Document): void => {
    let styleElement = frameDocument.getElementById(HOST_STYLE_ELEMENT_ID) as HTMLStyleElement | null;
    if (!styleElement) {
        styleElement = frameDocument.createElement("style");
        styleElement.id = HOST_STYLE_ELEMENT_ID;
        frameDocument.head.appendChild(styleElement);
    }

    styleElement.textContent = `${VIVLIOSTYLE_HOST_PRINT_CSS}\n${VIVLIOSTYLE_HOST_SCREEN_STACK_CSS}`;
};

/** Mounts CoreViewer into the navigated preview-host iframe and loads HTML via Blob URL. */
export const mountVivliostyleCoreViewer = async (
    iframe: HTMLIFrameElement,
    htmlDocument: string,
    userAgentRootURL: string,
): Promise<{ host: VivliostyleCoreViewerHost; result: PreviewLoadResult }> => {
    if (!userAgentRootURL) {
        throw new Error("Document preview requires userAgentRootURL");
    }

    const frameDocument = await waitForPreviewHostDocument(iframe);
    const frameWindow = iframe.contentWindow as (Window & typeof globalThis) | null;
    if (!frameWindow) {
        throw new Error("Vivliostyle preview iframe has no contentWindow");
    }

    ensureHostStyles(frameDocument);

    const viewportElement = frameDocument.getElementById(VIEWER_VIEWPORT_ID);
    if (!viewportElement) {
        throw new Error("Failed to find Vivliostyle viewport element in preview host");
    }

    viewportElement.replaceChildren();

    // Blob URLs inherit the creating document's CSP. Create them in the preview-host
    // iframe (nonce-excluded) so Vivliostyle inline <style> is not judged by Admin SPA nonce CSP.
    const documentBlob = new frameWindow.Blob([htmlDocument], { type: "text/html" });
    const documentBlobURL = frameWindow.URL.createObjectURL(documentBlob);

    const viewer = new CoreViewer(
        {
            viewportElement,
            window: frameWindow,
            userAgentRootURL,
        },
        VIEWER_OPTIONS,
    );

    const readyPromise = waitForViewerReady(viewer);
    viewer.loadDocument(documentBlobURL);

    const result = await readyPromise;

    return {
        host: {
            viewer,
            documentBlobURL,
            dispose: () => {
                frameWindow.URL.revokeObjectURL(documentBlobURL);
            },
        },
        result,
    };
};

/** Public load / session contracts for `@devstreamby/document-preview`. */

export type PreviewPageNav = {
    /** 1-based page index (SportPortal parity: `epage`). */
    epage: number;
    epageCount: number;
    first: boolean;
    last: boolean;
};

export type PreviewLoadInput = {
    /** Full HTML document string (report / template output). */
    htmlContent: string;
};

export type PreviewLoadOptions = {
    /**
     * CoreViewer `userAgentRootURL` — directory URL ending with `/`.
     * Required for stable UA resolution on CSP hosts.
     */
    userAgentRootURL: string;
};

export type PreviewPrintResult = { ok: true; pageCount: number } | { ok: false; reason: string };

/**
 * Opaque session. CoreViewer stays private inside the package.
 */
export type PreviewSession = {
    getPageNav: () => PreviewPageNav;
    subscribeNav: (listener: (nav: PreviewPageNav) => void) => () => void;
    navigate: (direction: "previous" | "next") => void;
    goToPage: (epage: number) => void;
    print: () => PreviewPrintResult;
    dispose: () => void;
};

/** Internal Core load outcome — not part of the public package surface. */
export type PreviewLoadResult = {
    status: "ready" | "error";
    errorMessage?: string;
    pageCount?: number;
};

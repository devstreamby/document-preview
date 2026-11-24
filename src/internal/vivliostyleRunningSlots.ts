import {
    getPageContainers,
    MARGIN_BOX_BOTTOM_LEFT_SELECTOR,
    parseHtmlDocument,
    resolvePageSubGroupKey,
} from "./vivliostyleDom";

export type VivliostyleGroupRunningSource = {
    type: string;
    subGroupKey: string;
    innerHtml: string;
};

/**
 * `position: running()` applies from the element forward — hoist document-level
 * running slots (no `data-running-group`) to the document start so margin boxes
 * work on every page. Subgroup slots keep `data-running-group` and are handled
 * by `moveGroupRunningSlotsToSubgroupStart`.
 */
export const hoistDocumentLevelRunningSlots = (doc: Document): void => {
    const roots = Array.from(doc.querySelectorAll<HTMLElement>("[data-document-id], .document"));
    const targets = roots.length > 0 ? roots : doc.body ? [doc.body] : [];

    for (const root of targets) {
        const documentLevel = Array.from(root.querySelectorAll<HTMLElement>(".running-slot")).filter(
            (slot) => root.contains(slot) && !slot.getAttribute("data-running-group"),
        );

        if (documentLevel.length === 0) {
            continue;
        }

        const unique = Array.from(new Set(documentLevel));
        const fragment = doc.createDocumentFragment();
        for (const slot of unique) {
            fragment.appendChild(slot);
        }
        root.insertBefore(fragment, root.firstChild);
    }
};

/**
 * Templates put subgroup running slots after the table; move each
 * `[data-running-group]` slot to the start of its subgroup root.
 */
export const moveGroupRunningSlotsToSubgroupStart = (doc: Document): void => {
    const groupSlots = Array.from(
        doc.querySelectorAll<HTMLElement>(
            ".running-slot[data-running-group], .running-slot[data-running-type='group']",
        ),
    );

    for (const slot of groupSlots) {
        const target = slot.closest<HTMLElement>("[data-document-subgroup-key]");
        if (!target || target === slot || target.firstChild === slot) {
            continue;
        }
        target.insertBefore(slot, target.firstChild);
    }
};

export const extractGroupRunningSources = (sourceHtml: string): VivliostyleGroupRunningSource[] => {
    const doc = parseHtmlDocument(sourceHtml);
    const sources: VivliostyleGroupRunningSource[] = [];

    const slots = Array.from(
        doc.querySelectorAll<HTMLElement>(
            ".running-slot[data-running-group], .running-slot[data-running-type='group']",
        ),
    );

    for (const slot of slots) {
        const type = (slot.getAttribute("data-running-type") || "group").trim();
        const subGroupKey =
            slot.getAttribute("data-running-group") ||
            slot.closest("[data-document-subgroup-key]")?.getAttribute("data-document-subgroup-key");
        if (!subGroupKey) {
            continue;
        }
        sources.push({
            type,
            subGroupKey,
            innerHtml: slot.innerHTML,
        });
    }

    return sources;
};

const setMarginBoxRunningHtml = (page: HTMLElement, type: string, html: string): void => {
    const typedSlots = Array.from(page.querySelectorAll<HTMLElement>(`.running-slot[data-running-type="${type}"]`));
    for (const slot of typedSlots) {
        if (slot.innerHTML !== html) {
            slot.innerHTML = html;
        }
    }

    if (type !== "group") {
        return;
    }

    const bottomLeft = page.querySelector<HTMLElement>(MARGIN_BOX_BOTTOM_LEFT_SELECTOR);
    if (!bottomLeft) {
        return;
    }

    const existingSlot = bottomLeft.querySelector<HTMLElement>(".running-slot");
    if (existingSlot) {
        if (existingSlot.innerHTML !== html) {
            existingSlot.innerHTML = html;
        }
        return;
    }

    if (bottomLeft.innerHTML !== html) {
        bottomLeft.innerHTML = html;
    }
};

export const fillGroupRunningSlots = (previewDocument: Document, sources: VivliostyleGroupRunningSource[]): void => {
    if (sources.length === 0) {
        return;
    }

    const byTypeAndSubgroup = new Map<string, VivliostyleGroupRunningSource>();
    for (const source of sources) {
        byTypeAndSubgroup.set(`${source.type}::${source.subGroupKey}`, source);
    }

    const types = new Set(sources.map((source) => source.type));
    const pages = getPageContainers(previewDocument);

    for (const page of pages) {
        const subGroupKey = resolvePageSubGroupKey(page);
        if (!subGroupKey) {
            continue;
        }

        for (const type of types) {
            const match = byTypeAndSubgroup.get(`${type}::${subGroupKey}`);
            if (!match) {
                continue;
            }
            setMarginBoxRunningHtml(page, type, match.innerHtml);
        }
    }
};

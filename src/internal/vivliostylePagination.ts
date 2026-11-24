import {
    getPageContainers,
    MARGIN_BOX_BOTTOM_RIGHT_SELECTOR,
    PAGE_CONTAINER_SELECTOR,
    parseHtmlDocument,
    resolvePageGroupKey,
} from "./vivliostyleDom";

const PAGINATION_PLACEHOLDER_NUMBER = "[[pageNumber]]";
const PAGINATION_PLACEHOLDER_TOTAL = "[[pageTotal]]";

type PagePaginationRef = {
    page: HTMLElement;
    number: number;
    total: number;
};

export const extractPaginationTemplate = (sourceHtml: string): string | null => {
    const doc = parseHtmlDocument(sourceHtml);
    const slot = doc.querySelector<HTMLElement>(".pagination-slot");
    if (!slot) {
        return null;
    }
    return slot.innerHTML || slot.textContent || null;
};

const analyzePaginationByGroup = (pages: HTMLElement[]): PagePaginationRef[] => {
    const groups = new Map<string, HTMLElement[]>();
    const ungrouped: HTMLElement[] = [];

    for (const page of pages) {
        const groupKey = resolvePageGroupKey(page);
        if (!groupKey) {
            ungrouped.push(page);
            continue;
        }
        const list = groups.get(groupKey) ?? [];
        list.push(page);
        groups.set(groupKey, list);
    }

    const result: PagePaginationRef[] = [];

    for (const groupPages of groups.values()) {
        groupPages.forEach((page, index) => {
            result.push({ page, number: index + 1, total: groupPages.length });
        });
    }

    ungrouped.forEach((page, index) => {
        result.push({ page, number: index + 1, total: ungrouped.length });
    });

    return result;
};

const renderPaginationContent = (template: string, number: number, total: number): string =>
    template
        .split(PAGINATION_PLACEHOLDER_NUMBER)
        .join(String(number))
        .split(PAGINATION_PLACEHOLDER_TOTAL)
        .join(String(total));

const fillSlotPlaceholders = (
    slot: HTMLElement,
    number: number,
    total: number,
    fallbackTemplate?: string | null,
): void => {
    const mode = (slot.getAttribute("data-pagination-mode") || "").trim().toLowerCase();
    if (mode === "no-first" && number === 1) {
        slot.remove();
        return;
    }

    const display = getComputedStyle(slot).display;
    if (display === "none" && !slot.classList.contains("running-slot")) {
        slot.remove();
        return;
    }

    const template =
        slot.getAttribute("data-pagination-template") ||
        (slot.innerHTML.includes(PAGINATION_PLACEHOLDER_NUMBER) || slot.innerHTML.includes(PAGINATION_PLACEHOLDER_TOTAL)
            ? slot.innerHTML
            : null) ||
        fallbackTemplate ||
        slot.innerHTML ||
        slot.textContent ||
        "";
    if (!slot.getAttribute("data-pagination-template") && template) {
        slot.setAttribute("data-pagination-template", template);
    }

    const content = renderPaginationContent(template, number, total);
    if (slot.innerHTML !== content) {
        slot.innerHTML = content;
    }
};

const fillBottomRightPagination = (
    page: HTMLElement,
    number: number,
    total: number,
    fallbackTemplate: string | null,
): void => {
    const bottomRight = page.querySelector<HTMLElement>(MARGIN_BOX_BOTTOM_RIGHT_SELECTOR);
    if (!bottomRight) {
        return;
    }

    if (number === 1) {
        const modeSlot =
            bottomRight.querySelector<HTMLElement>(".pagination-slot") ||
            page.querySelector<HTMLElement>(".pagination-slot");
        const mode = (modeSlot?.getAttribute("data-pagination-mode") || "").trim().toLowerCase();
        if (mode === "no-first") {
            bottomRight.innerHTML = "";
            return;
        }
    }

    const slotInBox = bottomRight.querySelector<HTMLElement>(".pagination-slot");
    if (slotInBox) {
        fillSlotPlaceholders(slotInBox, number, total, fallbackTemplate);
        return;
    }

    const template =
        fallbackTemplate ||
        page.querySelector<HTMLElement>(".pagination-slot")?.getAttribute("data-pagination-template") ||
        "Страница [[pageNumber]]";
    const content = renderPaginationContent(template, number, total);
    const wrapped = `<span class="pagination-slot">${content}</span>`;
    if (bottomRight.innerHTML !== wrapped && bottomRight.innerHTML !== content) {
        bottomRight.innerHTML = wrapped;
    }
};

export const fillPaginationSlots = (previewDocument: Document, paginationTemplate: string | null = null): void => {
    const pages = getPageContainers(previewDocument);
    if (pages.length === 0) {
        return;
    }

    const analyzed = analyzePaginationByGroup(pages);
    for (const entry of analyzed) {
        const slots = Array.from(entry.page.querySelectorAll<HTMLElement>(".pagination-slot"));
        for (const slot of slots) {
            fillSlotPlaceholders(slot, entry.number, entry.total, paginationTemplate);
        }
        fillBottomRightPagination(entry.page, entry.number, entry.total, paginationTemplate);
    }

    const orphanSlots = Array.from(previewDocument.querySelectorAll<HTMLElement>(".pagination-slot")).filter(
        (slot) => !slot.closest(PAGE_CONTAINER_SELECTOR),
    );
    if (orphanSlots.length === 0) {
        return;
    }

    const fallbackTotal = Math.max(pages.length, 1);
    orphanSlots.forEach((slot, index) => {
        fillSlotPlaceholders(slot, index + 1, fallbackTotal, paginationTemplate);
    });
};

import type { PageFindParams } from "./page-types";
import type { ElementRef, RefModel } from "./ref-model";

const MAX_TEXT_CHARS = 50_000;
const DEFAULT_FIND_LIMIT = 20;
const MAX_FIND_LIMIT = 100;

export interface ElementInfo {
  ref: string;
  tag: string;
  role?: string;
  text?: string;
  type?: string;
  href?: string;
  placeholder?: string;
  ariaLabel?: string;
  disabled?: boolean;
  checked?: boolean;
  selected?: boolean;
  value?: string;
  bounds?: { x: number; y: number; width: number; height: number };
}

export interface ElementMatch extends ElementInfo {
  score: number;
}

interface ScoredElement {
  element: Element;
  score: number;
}

function isVisible(element: Element): boolean {
  if (!(element instanceof HTMLElement)) return false;
  if (element.getAttribute("aria-hidden") === "true") return false;
  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden") return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function normalize(text: string | null | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

function candidateStrings(element: Element): string[] {
  const html = element as HTMLElement;
  const aria = element.getAttribute("aria-label");
  const title = element.getAttribute("title");
  const role = element.getAttribute("role");

  if (element instanceof HTMLInputElement) {
    return [
      element.value,
      element.placeholder,
      aria,
      title,
      role,
      html.innerText,
      element.type,
      element.name,
      element.id,
    ]
      .map((s) => normalize(s))
      .filter(Boolean);
  }

  if (element instanceof HTMLTextAreaElement) {
    return [
      element.value,
      element.placeholder,
      aria,
      title,
      role,
      html.innerText,
      element.name,
      element.id,
    ]
      .map((s) => normalize(s))
      .filter(Boolean);
  }

  if (element instanceof HTMLImageElement) {
    return [element.alt, aria, title, role, element.id]
      .map((s) => normalize(s))
      .filter(Boolean);
  }

  return [
    html.innerText,
    element.textContent,
    aria,
    title,
    role,
    element.getAttribute("placeholder"),
    element.getAttribute("alt"),
    element.getAttribute("value"),
    element.getAttribute("name"),
    element.id,
  ]
    .map((s) => normalize(s))
    .filter(Boolean);
}

function scoreElement(element: Element, queryTerms: string[]): number {
  if (queryTerms.length === 0) return 0;
  const haystack = candidateStrings(element);
  let score = 0;

  for (const term of queryTerms) {
    for (const value of haystack) {
      if (value === term) {
        score += 3;
      } else if (value.includes(term)) {
        score += 1;
      }
    }
  }

  return score;
}

export class PageReader {
  constructor(private readonly refModel: RefModel) {}

  getText(): { text: string } {
    const text = document.body?.innerText ?? "";
    return { text: text.slice(0, MAX_TEXT_CHARS) };
  }

  readPage(): { elements: ElementInfo[] } {
    const elements = this.collectElements();
    const refs = this.refModel.assign(elements);
    return {
      elements: refs.map((ref) => this.describeElement(ref)),
    };
  }

  find(params: PageFindParams): { matches: ElementMatch[] } {
    const query = normalize(params.query);
    if (!query) {
      return { matches: [] };
    }

    const terms = query.split(" ").filter(Boolean);
    const limit = Math.min(
      Math.max(1, params.limit ?? DEFAULT_FIND_LIMIT),
      MAX_FIND_LIMIT,
    );

    const scored: ScoredElement[] = [];
    for (const element of this.collectElements()) {
      const score = scoreElement(element, terms);
      if (score > 0) {
        scored.push({ element, score });
      }
    }

    scored.sort((a, b) => b.score - a.score);

    const top = scored.slice(0, limit);
    const refs = this.refModel.assign(top.map((entry) => entry.element));

    return {
      matches: refs.map((ref, index) => ({
        ...this.describeElement(ref),
        score: top[index]?.score ?? 0,
      })),
    };
  }

  private collectElements(): Element[] {
    const selector = [
      "a[href]",
      "button",
      "input",
      "select",
      "textarea",
      "summary",
      "[role]",
      "[onclick]",
      "[tabindex]",
      "h1,h2,h3,h4,h5,h6",
      "img[alt]",
      "[contenteditable='true']",
    ].join(",");

    const nodes = Array.from(document.querySelectorAll(selector));
    const seen = new Set<Element>();
    const elements: Element[] = [];

    for (const node of nodes) {
      if (seen.has(node)) continue;
      if (!isVisible(node)) continue;
      seen.add(node);
      elements.push(node);
    }

    return elements;
  }

  private describeElement(ref: ElementRef): ElementInfo {
    const element = this.refModel.resolve(ref.ref);
    const html = element as HTMLElement;
    const input =
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement
        ? element
        : null;
    const rect = html.getBoundingClientRect();

    return {
      ref: ref.ref,
      tag: ref.tag,
      role: ref.role,
      text: ref.text,
      type: element instanceof HTMLInputElement ? element.type : undefined,
      href: element instanceof HTMLAnchorElement ? element.href : undefined,
      placeholder: input?.placeholder,
      ariaLabel: element.getAttribute("aria-label") ?? undefined,
      disabled:
        element instanceof HTMLButtonElement ||
        element instanceof HTMLInputElement ||
        element instanceof HTMLSelectElement ||
        element instanceof HTMLTextAreaElement
          ? element.disabled
          : undefined,
      checked:
        element instanceof HTMLInputElement ? element.checked : undefined,
      selected:
        element instanceof HTMLOptionElement ? element.selected : undefined,
      value:
        element instanceof HTMLInputElement ||
        element instanceof HTMLTextAreaElement ||
        element instanceof HTMLSelectElement
          ? element.value
          : undefined,
      bounds: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      },
    };
  }
}

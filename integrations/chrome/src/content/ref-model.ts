export interface ElementRef {
  ref: string;
  tag: string;
  role?: string;
  text?: string;
}

interface RefEntry extends ElementRef {
  element: { deref(): Element | undefined };
}

const WeakRefCtor = (
  globalThis as {
    WeakRef?: new <T extends object>(target: T) => { deref(): T | undefined };
  }
).WeakRef;

function toRefPrefix(element: Element): string {
  const tag = element.tagName.toLowerCase();
  if (tag === "a") return "link";
  if (tag === "button") return "btn";
  if (tag === "input") return "input";
  if (tag === "textarea") return "textarea";
  if (tag === "select") return "select";
  if (tag === "img") return "img";
  return tag;
}

function toText(element: Element): string | undefined {
  const visibleText =
    element instanceof HTMLElement ? element.innerText : element.textContent;
  const normalized = visibleText?.replace(/\s+/g, " ").trim();
  if (!normalized) return undefined;
  return normalized.slice(0, 120);
}

function makeWeakElementRef(element: Element): {
  deref(): Element | undefined;
} {
  if (WeakRefCtor) {
    return new WeakRefCtor(element);
  }
  return {
    deref: () => element,
  };
}

export class RefModel {
  private refs = new Map<string, RefEntry>();

  private byElement = new WeakMap<Element, string>();

  private counter = 0;

  assign(elements: Element[]): ElementRef[] {
    const results: ElementRef[] = [];

    for (const element of elements) {
      let ref = this.byElement.get(element);

      if (!ref) {
        this.counter += 1;
        ref = `${toRefPrefix(element)}-${this.counter}`;
        this.byElement.set(element, ref);
      }

      const role = element.getAttribute("role") ?? undefined;
      const text = toText(element);

      this.refs.set(ref, {
        ref,
        tag: element.tagName.toLowerCase(),
        role,
        text,
        element: makeWeakElementRef(element),
      });

      results.push({ ref, tag: element.tagName.toLowerCase(), role, text });
    }

    return results;
  }

  resolve(ref: string): Element {
    const entry = this.refs.get(ref);
    if (!entry) {
      throw new Error(`Unknown ref: ${ref}`);
    }

    const element = entry.element.deref();
    if (!element || !document.contains(element)) {
      this.refs.delete(ref);
      throw new Error(
        `Stale ref: ${ref} (element no longer in DOM). Use browser_page_read to get fresh refs.`,
      );
    }

    return element;
  }

  clear(): void {
    this.refs.clear();
    this.byElement = new WeakMap<Element, string>();
    this.counter = 0;
  }
}

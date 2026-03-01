import type {
  PageClickParams,
  PageFormInputParams,
  PageHoverParams,
  PageKeyParams,
  PageScrollParams,
  PageTypeParams,
} from "./page-types";
import type { RefModel } from "./ref-model";

const DEFAULT_SCROLL_AMOUNT = 500;

function isTextEditable(
  element: Element,
): element is HTMLInputElement | HTMLTextAreaElement | HTMLElement {
  if (element instanceof HTMLInputElement) {
    return !["checkbox", "radio", "file", "button", "submit", "reset"].includes(
      element.type,
    );
  }

  if (element instanceof HTMLTextAreaElement) {
    return true;
  }

  return element instanceof HTMLElement && element.isContentEditable;
}

function dispatchInput(target: EventTarget): void {
  target.dispatchEvent(new Event("input", { bubbles: true }));
  target.dispatchEvent(new Event("change", { bubbles: true }));
}

function parseKeys(keys: string): { key: string; modifiers: KeyModifiers } {
  const chunks = keys
    .split("+")
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  if (chunks.length === 0) {
    throw new Error("Key input is empty");
  }

  const modifiers: KeyModifiers = {
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
  };

  const keyChunk = chunks[chunks.length - 1] as string;
  for (const part of chunks.slice(0, -1)) {
    const lower = part.toLowerCase();
    if (lower === "alt" || lower === "option") modifiers.altKey = true;
    if (lower === "ctrl" || lower === "control") modifiers.ctrlKey = true;
    if (lower === "cmd" || lower === "meta") modifiers.metaKey = true;
    if (lower === "shift") modifiers.shiftKey = true;
  }

  return { key: keyChunk, modifiers };
}

interface KeyModifiers {
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}

export class InteractionEngine {
  constructor(private readonly refModel: RefModel) {}

  async click(params: PageClickParams): Promise<{ ok: true }> {
    const element = this.resolveTarget(params.ref, params.x, params.y);
    this.checkInteractable(element, params.ref);
    (element as HTMLElement).click();
    return { ok: true };
  }

  async type(params: PageTypeParams): Promise<{ ok: true }> {
    const target = params.ref
      ? this.refModel.resolve(params.ref)
      : document.activeElement;

    if (!target) {
      throw new Error("No focused element for typing");
    }

    this.checkInteractable(target, params.ref);

    if (!isTextEditable(target)) {
      throw new Error(
        `Element ${params.ref ?? "(focused)"} is not editable. Select an input, textarea, or contenteditable element.`,
      );
    }

    (target as HTMLElement).focus();

    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement
    ) {
      target.value += params.text;
      dispatchInput(target);
      return { ok: true };
    }

    const editable = target as HTMLElement;
    editable.textContent = (editable.textContent ?? "") + params.text;
    dispatchInput(editable);
    return { ok: true };
  }

  async scroll(params: PageScrollParams): Promise<{ ok: true }> {
    const amount = params.amount ?? DEFAULT_SCROLL_AMOUNT;
    const delta = {
      up: { top: -Math.abs(amount), left: 0 },
      down: { top: Math.abs(amount), left: 0 },
      left: { top: 0, left: -Math.abs(amount) },
      right: { top: 0, left: Math.abs(amount) },
    }[params.direction];

    if (!delta) {
      throw new Error(`Unsupported direction: ${params.direction}`);
    }

    if (params.ref) {
      const element = this.refModel.resolve(params.ref);
      if (!(element instanceof HTMLElement)) {
        throw new Error(`Element ${params.ref} is not scrollable`);
      }
      element.scrollBy({ ...delta, behavior: "smooth" });
      return { ok: true };
    }

    window.scrollBy({ ...delta, behavior: "smooth" });
    return { ok: true };
  }

  async key(params: PageKeyParams): Promise<{ ok: true }> {
    const target = document.activeElement ?? document.body;
    if (!target) {
      throw new Error("No element available for keyboard input");
    }

    const { key, modifiers } = parseKeys(params.keys);
    const eventInit: KeyboardEventInit = {
      key,
      bubbles: true,
      cancelable: true,
      ...modifiers,
    };

    target.dispatchEvent(new KeyboardEvent("keydown", eventInit));
    target.dispatchEvent(new KeyboardEvent("keypress", eventInit));
    target.dispatchEvent(new KeyboardEvent("keyup", eventInit));

    return { ok: true };
  }

  async hover(params: PageHoverParams): Promise<{ ok: true }> {
    const element = this.resolveTarget(params.ref, params.x, params.y);
    const eventInit: MouseEventInit = { bubbles: true, cancelable: true };
    element.dispatchEvent(new MouseEvent("mouseover", eventInit));
    element.dispatchEvent(new MouseEvent("mouseenter", eventInit));
    return { ok: true };
  }

  async formInput(params: PageFormInputParams): Promise<{ ok: true }> {
    const element = this.refModel.resolve(params.ref);
    this.checkInteractable(element, params.ref);

    if (element instanceof HTMLInputElement) {
      if (element.type === "checkbox" || element.type === "radio") {
        const shouldCheck = ["true", "1", "yes", "on"].includes(
          params.value.toLowerCase(),
        );
        element.checked = shouldCheck;
      } else {
        element.value = params.value;
      }
      dispatchInput(element);
      return { ok: true };
    }

    if (element instanceof HTMLTextAreaElement) {
      element.value = params.value;
      dispatchInput(element);
      return { ok: true };
    }

    if (element instanceof HTMLSelectElement) {
      element.value = params.value;
      if (element.value !== params.value) {
        const option = Array.from(element.options).find(
          (item) =>
            item.label.toLowerCase() === params.value.toLowerCase() ||
            item.text.toLowerCase() === params.value.toLowerCase(),
        );
        if (option) element.value = option.value;
      }
      dispatchInput(element);
      return { ok: true };
    }

    throw new Error(`Element ${params.ref} does not support form input`);
  }

  private resolveTarget(ref?: string, x?: number, y?: number): Element {
    if (ref) {
      return this.refModel.resolve(ref);
    }

    if (typeof x !== "number" || typeof y !== "number") {
      throw new Error("Provide either ref or numeric x,y coordinates");
    }

    const element = document.elementFromPoint(x, y);
    if (!element) {
      throw new Error("No element at target coordinates");
    }

    return element;
  }

  private checkInteractable(element: Element, ref?: string): void {
    if (!(element instanceof HTMLElement)) {
      throw new Error(`Element ${ref ?? "target"} is not an HTMLElement`);
    }

    const style = window.getComputedStyle(element);
    if (style.display === "none") {
      throw new Error(`Element ${ref ?? "target"} is hidden (display: none)`);
    }
    if (style.visibility === "hidden") {
      throw new Error(
        `Element ${ref ?? "target"} is hidden (visibility: hidden)`,
      );
    }

    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      throw new Error(`Element ${ref ?? "target"} has no layout box`);
    }

    if (
      element instanceof HTMLButtonElement ||
      element instanceof HTMLInputElement ||
      element instanceof HTMLSelectElement ||
      element instanceof HTMLTextAreaElement
    ) {
      if (element.disabled) {
        throw new Error(`Element ${ref ?? "target"} is disabled`);
      }
    }
  }
}

export type ScrollDirection = "up" | "down" | "left" | "right";

export interface PageClickParams {
  ref?: string;
  x?: number;
  y?: number;
}

export interface PageTypeParams {
  ref?: string;
  text: string;
}

export interface PageScrollParams {
  direction: ScrollDirection;
  amount?: number;
  ref?: string;
}

export interface PageKeyParams {
  keys: string;
}

export interface PageHoverParams {
  ref?: string;
  x?: number;
  y?: number;
}

export interface PageFormInputParams {
  ref: string;
  value: string;
}

export interface PageFindParams {
  query: string;
  limit?: number;
}

export type PageCommand =
  | { type: "PAGE_CLICK"; params: PageClickParams }
  | { type: "PAGE_TYPE"; params: PageTypeParams }
  | { type: "PAGE_SCROLL"; params: PageScrollParams }
  | { type: "PAGE_KEY"; params: PageKeyParams }
  | { type: "PAGE_HOVER"; params: PageHoverParams }
  | { type: "PAGE_FORM_INPUT"; params: PageFormInputParams }
  | { type: "PAGE_GET_TEXT"; params?: Record<string, never> }
  | { type: "PAGE_READ_PAGE"; params?: Record<string, never> }
  | { type: "PAGE_FIND"; params: PageFindParams }
  | { type: "PAGE_SET_INDICATOR"; params: { active: boolean } };

export function isPageCommand(value: unknown): value is PageCommand {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { type?: unknown };
  return (
    candidate.type === "PAGE_CLICK" ||
    candidate.type === "PAGE_TYPE" ||
    candidate.type === "PAGE_SCROLL" ||
    candidate.type === "PAGE_KEY" ||
    candidate.type === "PAGE_HOVER" ||
    candidate.type === "PAGE_FORM_INPUT" ||
    candidate.type === "PAGE_GET_TEXT" ||
    candidate.type === "PAGE_READ_PAGE" ||
    candidate.type === "PAGE_FIND" ||
    candidate.type === "PAGE_SET_INDICATOR"
  );
}

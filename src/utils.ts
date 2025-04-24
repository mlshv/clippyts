export const getWindowScroll = () => {
  const supportPageOffset = window.pageXOffset !== undefined;
  const isCSS1Compat = (document.compatMode || "") === "CSS1Compat";

  const scrollLeft = supportPageOffset
    ? window.pageXOffset
    : isCSS1Compat
    ? document.documentElement.scrollLeft
    : document.body.scrollLeft;
  const scrollTop = supportPageOffset
    ? window.pageYOffset
    : isCSS1Compat
    ? document.documentElement.scrollTop
    : document.body.scrollTop;
  return {
    scrollLeft,
    scrollTop,
  };
};

export function getOffset(element: HTMLElement) {
  if (!element.getClientRects().length) {
    return { top: 0, left: 0 };
  }

  const rect = element.getBoundingClientRect();
  const win = element.ownerDocument.defaultView || {
    pageXOffset: 0,
    pageYOffset: 0,
  };
  return {
    top: rect.top + win.pageYOffset,
    left: rect.left + win.pageXOffset,
  };
}

export function getWidth(
  el: HTMLElement,
  type: "inner" | "outer" | "width" | "full"
) {
  if (type === "inner")
    // .innerWidth()
    return el.clientWidth;
  if (type === "outer")
    // .outerWidth()
    return el.offsetWidth;
  const s = window.getComputedStyle(el, null);
  if (type === "width")
    // .width()
    return (
      el.clientWidth -
      Number.parseInt(s.getPropertyValue("padding-left")) -
      Number.parseInt(s.getPropertyValue("padding-right"))
    );
  if (type === "full")
    // .outerWidth(includeMargins = true)
    return (
      el.offsetWidth +
      Number.parseInt(s.getPropertyValue("margin-left")) +
      Number.parseInt(s.getPropertyValue("margin-right"))
    );
  return null;
}

export function getHeight(
  el: HTMLElement,
  type: "inner" | "outer" | "height" | "full"
) {
  if (type === "inner")
    // .innerHeight()
    return el.clientHeight;
  if (type === "outer")
    // .outerHeight()
    return el.offsetHeight;
  const s = window.getComputedStyle(el, null);
  if (type === "height")
    // .height()
    return (
      el.clientHeight -
      Number.parseInt(s.getPropertyValue("padding-top")) -
      Number.parseInt(s.getPropertyValue("padding-bottom"))
    );
  if (type === "full")
    // .outerWidth(includeMargins = true)
    return (
      el.offsetHeight +
      Number.parseInt(s.getPropertyValue("margin-top")) +
      Number.parseInt(s.getPropertyValue("margin-bottom"))
    );
  return null;
}

// Stub for jQuery.Deferred
export class Deferred {
  public promise!: Promise<void>;
  // biome-ignore lint/suspicious/noExplicitAny: skip
  public resolve!: (value?: any) => void;
  // biome-ignore lint/suspicious/noExplicitAny: skip
  public reject!: (reason?: any) => void;

  constructor() {
    this.promise = new Promise((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
  }
}

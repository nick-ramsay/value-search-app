declare module "bootstrap/dist/js/bootstrap.bundle.min.js";

declare module "bootstrap/js/dist/modal" {
  class Modal {
    constructor(
      el: Element,
      options?: Partial<{ backdrop: boolean | "static"; keyboard: boolean }>,
    );
    static getOrCreateInstance(
      el: Element,
      options?: Partial<{ backdrop: boolean | "static"; keyboard: boolean }>,
    ): Modal;
    show(): void;
    hide(): void;
    dispose(): void;
  }
  export default Modal;
}

declare module "bootstrap" {
  export class Modal {
    constructor(el: Element, options?: Partial<{ backdrop: boolean; keyboard: boolean }>);
    show(): void;
    hide(): void;
    dispose(): void;
  }
}

declare module "bootstrap/dist/js/bootstrap.bundle.min.js";

declare module "bootstrap" {
  export class Modal {
    constructor(el: Element, options?: Partial<{ backdrop: boolean; keyboard: boolean }>);
    show(): void;
    hide(): void;
    dispose(): void;
  }
}

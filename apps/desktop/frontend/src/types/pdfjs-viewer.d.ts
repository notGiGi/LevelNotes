declare module "pdfjs-dist/web/pdf_viewer" {
  export class TextLayer {
    constructor(opts: any);
    render(): Promise<void> | void;
    update?(opts: any): void;
    cancel?(): void;
    textDivs?: any[];
    textContentItemsStr?: any[];
  }

  export class TextLayerBuilder {
    constructor(opts: any);
    div: HTMLDivElement;
    render(opts: any): Promise<void>;
    cancel(): void;
    hide(): void;
    show(): void;
  }
}

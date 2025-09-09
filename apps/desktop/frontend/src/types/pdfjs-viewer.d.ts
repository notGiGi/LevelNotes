declare module "pdfjs-dist/web/pdf_viewer" {
  export class TextLayer {
    constructor(opts: any);
    render(): Promise<void> | void;
  }
}

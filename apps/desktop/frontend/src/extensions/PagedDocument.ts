import Document from "@tiptap/extension-document";

export const PagedDocument = Document.extend({
  content: "page+"
});

export default PagedDocument;

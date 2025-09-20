import { Node, mergeAttributes } from "@tiptap/core";
import { TextSelection } from "prosemirror-state";

export interface PageOptions {
  HTMLAttributes: Record<string, any>;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    page: {
      appendPage: () => ReturnType;
      removeLastPage: () => ReturnType;
    };
  }
}

const createEmptyPageNode = (type: any) => type.createAndFill();

export const Page = Node.create<PageOptions>({
  name: "page",
  group: "block",
  content: "block+",
  defining: true,
  isolating: true,

  addOptions() {
    return {
      HTMLAttributes: {
        "data-type": "page",
        class: "editor-page",
        style: "height: var(--paper-page-height); min-height: var(--paper-page-height); max-height: var(--paper-page-height); overflow: hidden;"
      }
    };
  },

  parseHTML() {
    return [
      { tag: "section[data-type='page']" },
      { tag: "div[data-type='page']" }
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ["section", mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0];
  },

  addCommands() {
    return {
      appendPage: () => ({ state, dispatch }) => {
        const type = state.schema.nodes[this.name];
        if (!type) {
          return false;
        }

        const pageNode = createEmptyPageNode(type);
        if (!pageNode) {
          return false;
        }

        const insertPos = state.doc.content.size;
        const tr = state.tr.insert(insertPos, pageNode);
        const selectionPos = tr.doc.resolve(Math.min(tr.doc.content.size, insertPos + 1));
        const selection = TextSelection.near(selectionPos, 1);
        tr.setSelection(selection);

        if (dispatch) {
          dispatch(tr.scrollIntoView());
        }

        return true;
      },
      removeLastPage: () => ({ state, dispatch }) => {
        if (state.doc.childCount <= 1) {
          return false;
        }

        const lastChild = state.doc.lastChild;
        if (!lastChild) {
          return false;
        }

        const from = state.doc.content.size - lastChild.nodeSize;
        const to = state.doc.content.size;
        const tr = state.tr.delete(from, to);
        const selectionPos = tr.doc.resolve(Math.max(0, from - 1));
        tr.setSelection(TextSelection.near(selectionPos, -1));

        if (dispatch) {
          dispatch(tr.scrollIntoView());
        }

        return true;
      }
    };
  }
});

export default Page;

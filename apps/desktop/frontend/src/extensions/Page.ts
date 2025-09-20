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
      splitPageAtCursor: () => ReturnType;
    };
  }
}

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
        class: "editor-page"
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
        const type = state.schema.nodes.page;
        const paragraphType = state.schema.nodes.paragraph;
        if (!type || !paragraphType) return false;

        const pageNode = type.create(null, paragraphType.create());
        if (!pageNode) return false;

        const insertPos = state.doc.content.size;
        const tr = state.tr.insert(insertPos, pageNode);
        const selectionPos = tr.doc.resolve(Math.min(tr.doc.content.size - 1, insertPos + 1));
        tr.setSelection(TextSelection.near(selectionPos, 1));

        if (dispatch) {
          dispatch(tr.scrollIntoView());
        }
        return true;
      },

      removeLastPage: () => ({ state, dispatch }) => {
        if (state.doc.childCount <= 1) return false;

        const lastChild = state.doc.lastChild;
        if (!lastChild) return false;

        const from = state.doc.content.size - lastChild.nodeSize;
        const to = state.doc.content.size;
        const tr = state.tr.delete(from, to);
        const selectionPos = tr.doc.resolve(Math.max(0, from - 1));
        tr.setSelection(TextSelection.near(selectionPos, -1));

        if (dispatch) {
          dispatch(tr.scrollIntoView());
        }
        return true;
      },

      splitPageAtCursor: () => ({ state, dispatch }) => {
        const { $from } = state.selection;
        const pagePos = $from.before(1);
        const pageNode = state.doc.nodeAt(pagePos);
        
        if (!pageNode || pageNode.type.name !== "page") return false;

        const type = state.schema.nodes.page;
        const paragraphType = state.schema.nodes.paragraph;
        
        const splitPos = $from.pos - pagePos - 1;
        const keepContent = pageNode.content.cut(0, splitPos);
        const moveContent = pageNode.content.cut(splitPos);

        if (!moveContent.size) return false;

        const newPage = type.create(null, moveContent);
        const currentPage = type.create(pageNode.attrs, keepContent);

        let tr = state.tr.replaceWith(pagePos, pagePos + pageNode.nodeSize, currentPage);
        const insertPos = pagePos + currentPage.nodeSize;
        tr = tr.insert(insertPos, newPage);

        if (dispatch) {
          dispatch(tr.scrollIntoView());
        }
        return true;
      }
    };
  }
});

export default Page;

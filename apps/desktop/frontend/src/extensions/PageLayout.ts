import { Extension } from "@tiptap/core";
import { Plugin } from "prosemirror-state";
import { TextSelection } from "prosemirror-state";
import { Fragment } from "prosemirror-model";
import { EditorView } from "prosemirror-view";

const PAGE_CLASS = "editor-page";
const HEIGHT_TOLERANCE = 10;
const MIN_SPLIT_OFFSET = 5;
const CHECK_INTERVAL = 150;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const ensureFragment = (content: Fragment, paragraphType: any) => {
  if (content.size === 0) {
    const p = paragraphType.createAndFill();
    return p ? Fragment.from([p]) : Fragment.empty;
  }
  return content;
};

const createScheduler = (view: EditorView) => {
  let timeoutId: NodeJS.Timeout | null = null;
  
  const request = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      enforceLayout(view);
      timeoutId = null;
    }, CHECK_INTERVAL);
  };
  
  const cancel = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };
  
  return { request, cancel };
};

const findSplitPos = (
  view: EditorView,
  pageDom: HTMLElement,
  pageBottom: number,
  blockDom: HTMLElement,
  blockStart: number,
  blockEnd: number
): number | null => {
  let low = blockStart + MIN_SPLIT_OFFSET;
  let high = blockEnd - MIN_SPLIT_OFFSET;
  let result: number | null = null;
  let iterations = 0;

  while (low <= high && iterations < 30) {
    iterations += 1;
    const mid = Math.floor((low + high) / 2);
    try {
      const rect = view.coordsAtPos(mid);
      if (!rect) break;
      if (rect.bottom <= pageBottom + HEIGHT_TOLERANCE) {
        result = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    } catch (err) {
      high = mid - 1;
    }
  }

  return result != null ? clamp(result, blockStart + MIN_SPLIT_OFFSET, blockEnd - MIN_SPLIT_OFFSET) : null;
};

const enforceLayout = (view: EditorView) => {
  const { state } = view;
  const pageType = state.schema.nodes.page;
  const paragraphType = state.schema.nodes.paragraph;

  if (!pageType || !paragraphType) return;

  const doc = state.doc;
  let pos = 0;

  for (let pageIndex = 0; pageIndex < doc.childCount; pageIndex += 1) {
    const pageNode = doc.child(pageIndex);
    const pagePos = pos;
    pos += pageNode.nodeSize;

    if (pageNode.type !== pageType) continue;

    const pageDom = view.nodeDOM(pagePos) as HTMLElement | null;
    if (!pageDom || !pageDom.classList.contains(PAGE_CLASS)) continue;

    const style = window.getComputedStyle(pageDom);
    const paddingTop = parseFloat(style.paddingTop) || 0;
    const paddingBottom = parseFloat(style.paddingBottom) || 0;
    const maxHeight = pageDom.clientHeight - paddingBottom;
    
    const pageRect = pageDom.getBoundingClientRect();
    const pageBottom = pageRect.top + maxHeight;
    const children = Array.from(pageDom.children) as HTMLElement[];

    let offendingIndex = -1;
    for (let i = 0; i < children.length; i += 1) {
      const child = children[i];
      const childRect = child.getBoundingClientRect();
      const bottom = childRect.bottom;
      if (bottom > pageBottom + HEIGHT_TOLERANCE) {
        offendingIndex = i;
        break;
      }
    }

    if (offendingIndex === -1) continue;

    let overflowOffset = 0;
    pageNode.forEach((child, offset, index) => {
      if (index === offendingIndex) {
        overflowOffset = offset;
      }
    });

    const pageStart = pagePos + 1;
    const blockNode = pageNode.child(offendingIndex);
    const blockStart = pageStart + overflowOffset;
    const blockEnd = blockStart + blockNode.nodeSize;

    const splitPos = findSplitPos(view, pageDom, pageBottom, children[offendingIndex], blockStart, blockEnd);
    
    if (splitPos && splitPos > blockStart && splitPos < blockEnd) {
      const relativeSplit = splitPos - pageStart;
      const keepContent = ensureFragment(pageNode.content.cut(0, relativeSplit), paragraphType);
      const overflowContent = ensureFragment(pageNode.content.cut(relativeSplit), paragraphType);

      if (overflowContent.size > 0) {
        const trimmedPage = pageType.create(pageNode.attrs, keepContent);
        let tr = state.tr.replaceWith(pagePos, pagePos + pageNode.nodeSize, trimmedPage);

        const trimmedSize = trimmedPage.nodeSize;
        const nextPagePos = pagePos + trimmedSize;

        if (pageIndex + 1 < tr.doc.childCount) {
          const nextPageNode = tr.doc.child(pageIndex + 1);
          const combinedContent = overflowContent.append(nextPageNode.content);
          const newNextPage = pageType.create(nextPageNode.attrs, ensureFragment(combinedContent, paragraphType));
          const replaceFrom = nextPagePos;
          const replaceTo = nextPagePos + nextPageNode.nodeSize;
          tr = tr.replaceWith(replaceFrom, replaceTo, newNextPage);
        } else {
          const newPageNode = pageType.create(null, overflowContent);
          tr = tr.insert(nextPagePos, newPageNode);
        }

        const selectionPos = Math.min(nextPagePos + 1, tr.doc.content.size);
        tr = tr.setSelection(TextSelection.near(tr.doc.resolve(selectionPos), 1));
        view.dispatch(tr.scrollIntoView());
        return;
      }
    }
  }
};

const PageLayout = Extension.create({
  name: "pageLayout",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        view: view => {
          if (typeof window === "undefined") {
            return {};
          }

          const scheduler = createScheduler(view);
          scheduler.request();

          return {
            update() {
              scheduler.request();
            },
            destroy() {
              scheduler.cancel();
            }
          };
        }
      })
    ];
  }
});

export default PageLayout;

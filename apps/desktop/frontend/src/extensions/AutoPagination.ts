import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "prosemirror-state";
import { TextSelection } from "prosemirror-state";
import { Fragment } from "prosemirror-model";

const PAGE_HEIGHT = 896; // Height minus padding (1056 - 80 - 80)
const LINE_HEIGHT = 32;
const LINES_PER_PAGE = Math.floor(PAGE_HEIGHT / LINE_HEIGHT);

export const AutoPagination = Extension.create({
  name: "autoPagination",

  addProseMirrorPlugins() {
    const extension = this;
    
    return [
      new Plugin({
        key: new PluginKey("autoPagination"),
        
        appendTransaction(transactions, oldState, newState) {
          const docChanged = transactions.some(tr => tr.docChanged);
          if (!docChanged) return null;

          const { doc, schema, tr: transaction } = newState;
          const pageType = schema.nodes.page;
          const paragraphType = schema.nodes.paragraph;
          
          if (!pageType || !paragraphType) return null;

          let modified = false;
          let pos = 0;

          for (let i = 0; i < doc.childCount; i++) {
            const pageNode = doc.child(i);
            if (pageNode.type !== pageType) {
              pos += pageNode.nodeSize;
              continue;
            }

            // Calculate content height
            let lines = 0;
            let splitIndex = -1;
            let splitOffset = 0;
            
            pageNode.forEach((child, offset, index) => {
              const childLines = Math.ceil(child.textContent.length / 80) || 1;
              
              if (lines + childLines > LINES_PER_PAGE && splitIndex === -1) {
                splitIndex = index;
                splitOffset = offset;
              }
              lines += childLines;
            });

            // If content exceeds page limit
            if (splitIndex !== -1 && splitOffset > 0) {
              const keepContent = pageNode.content.cut(0, splitOffset);
              const overflowContent = pageNode.content.cut(splitOffset);

              if (overflowContent.size > 0) {
                // Replace current page with trimmed content
                const trimmedPage = pageType.create(pageNode.attrs, keepContent);
                transaction.replaceWith(pos, pos + pageNode.nodeSize, trimmedPage);

                const nextPos = pos + trimmedPage.nodeSize;

                // Check if next page exists
                if (i + 1 < doc.childCount) {
                  const nextPage = doc.child(i + 1);
                  if (nextPage.type === pageType) {
                    // Prepend overflow to next page
                    const combined = Fragment.from([
                      ...overflowContent.content,
                      ...nextPage.content.content
                    ]);
                    const mergedPage = pageType.create(nextPage.attrs, combined);
                    transaction.replaceWith(
                      nextPos,
                      nextPos + nextPage.nodeSize,
                      mergedPage
                    );
                  } else {
                    // Insert new page
                    const newPage = pageType.create(null, overflowContent);
                    transaction.insert(nextPos, newPage);
                  }
                } else {
                  // Create new page at end
                  const newPage = pageType.create(null, overflowContent);
                  transaction.insert(nextPos, newPage);
                }
                
                modified = true;
                break; // Process one page at a time
              }
            }

            pos += pageNode.nodeSize;
          }

          return modified ? transaction : null;
        }
      })
    ];
  }
});

export default AutoPagination;

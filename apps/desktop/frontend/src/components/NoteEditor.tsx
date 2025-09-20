import React, { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Highlight from "@tiptap/extension-highlight";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import PagedDocument from "../extensions/PagedDocument";
import Page from "../extensions/Page";
import { Note } from "../App";

const API = "http://127.0.0.1:3030";

const PAPER_STYLES = {
  blank: { name: "Blank", icon: "BL", className: "paper-blank" },
  lined: { name: "Lined", icon: "LN", className: "paper-lined" },
  grid: { name: "Grid", icon: "GR", className: "paper-grid" },
  dotted: { name: "Dotted", icon: "DT", className: "paper-dotted" },
  cornell: { name: "Cornell", icon: "CN", className: "paper-cornell" }
};

const DEFAULT_PAGE_HTML = '<section data-type="page" class="editor-page"><p></p></section>';

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const buildPdfParagraphs = (value: string) => {
  const safe = escapeHtml(value.trim());
  if (!safe) {
    return "";
  }

  const segments = safe
    .split(/\n{2,}/)
    .map(segment => `<p class="pdf-quote">${segment.replace(/\n/g, "<br>")}</p>`);

  return segments.join("");
};

const ensurePagedContent = (value?: string | null) => {
  if (typeof window === "undefined") {
    return value && value.trim().length ? value : DEFAULT_PAGE_HTML;
  }

  const initial = value?.trim();
  if (!initial) {
    return DEFAULT_PAGE_HTML;
  }

  const container = window.document.createElement("div");
  container.innerHTML = initial;

  if (container.querySelector("section[data-type='page']")) {
    return container.innerHTML || DEFAULT_PAGE_HTML;
  }

  const createPageSection = () => {
    const section = window.document.createElement("section");
    section.setAttribute("data-type", "page");
    section.classList.add("editor-page");
    return section;
  };

  const sections: HTMLElement[] = [];
  let current = createPageSection();

  const flushCurrent = () => {
    if (!current.childNodes.length) {
      current.appendChild(window.document.createElement("p"));
    }
    sections.push(current);
    current = createPageSection();
  };

  container.childNodes.forEach(node => {
    if (
      node instanceof window.HTMLElement &&
      (node.dataset.type === "page-break" || node.classList.contains("page-break-node"))
    ) {
      flushCurrent();
      return;
    }

    current.appendChild(node.cloneNode(true));
  });

  if (!sections.length) {
    if (!current.childNodes.length) {
      current.appendChild(window.document.createElement("p"));
    }
    sections.push(current);
  } else if (current.childNodes.length) {
    sections.push(current);
  }

  const output = window.document.createElement("div");
  sections.forEach(section => output.appendChild(section));

  return output.innerHTML || DEFAULT_PAGE_HTML;
};

type Props = {
  note: Note;
  onUpdate: () => void;
};

export default function NoteEditor({ note, onUpdate }: Props) {
  const [paperStyle, setPaperStyle] = useState("lined");
  const [wordCount, setWordCount] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSyncedHtmlRef = useRef<string | null>(null);

  const saveNote = useCallback(async (htmlContent: string, plainContent: string) => {
    try {
      const response = await fetch(`${API}/update/${note.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: note.title,
          tags: note.tags,
          html: htmlContent,
          plaintext: plainContent
        })
      });

      if (!response.ok) {
        console.error("Failed to save note:", response.status);
      }
    } catch (e) {
      console.error("Failed to save:", e);
    }
  }, [note.id, note.tags, note.title]);

  const initialContent = useMemo(() => ensurePagedContent(note.content), [note.id]);

  const editor = useEditor({
    extensions: [
      PagedDocument,
      Page,
      StarterKit.configure({
        document: false,
        trailingNode: false,
        heading: { levels: [1, 2, 3] },
        blockquote: { HTMLAttributes: { class: "editor-blockquote" } }
      }),
      Highlight.configure({ multicolor: true }),
      TextStyle,
      Color,
      Image,
      Placeholder.configure({
        placeholder: ({ node }) => {
          if (node.type.name === "heading" && node.attrs.level === 1) {
            return "Title...";
          }
          if (node.type.name === "heading") {
            return "Heading...";
          }
          return "Start writing your thoughts...";
        }
      })
    ],
    content: initialContent,
    editorProps: {
      attributes: {
        class: "note-editor-text",
        spellcheck: "false"
      }
    },
    onUpdate: ({ editor }) => {
      const plainText = editor.getText();
      setWordCount(plainText.split(/\s+/).filter(word => word.length > 0).length);

      const html = editor.getHTML();
      lastSyncedHtmlRef.current = html;

      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      saveTimeoutRef.current = setTimeout(() => {
        saveNote(html, plainText);
      }, 1000);
    }
  });

  useEffect(() => {
    if (!editor) {
      return;
    }

    const sanitized = ensurePagedContent(note.content);
    const sanitizedTrimmed = sanitized.trim();
    const previousTrimmed = (lastSyncedHtmlRef.current ?? "").trim();
    if (sanitizedTrimmed === previousTrimmed) {
      return;
    }

    const current = editor.getHTML();
    if (sanitizedTrimmed === current.trim()) {
      lastSyncedHtmlRef.current = sanitized;
      return;
    }

    editor.commands.setContent(sanitized);
    lastSyncedHtmlRef.current = sanitized;
  }, [editor, note.content, note.id]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    const dom = editor.view.dom as HTMLElement;
    const prefix = "paper-style-";

    Array.from(dom.classList)
      .filter(cls => cls.startsWith(prefix))
      .forEach(cls => dom.classList.remove(cls));

    dom.classList.add(`${prefix}${paperStyle}`);
  }, [editor, paperStyle]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    const updatePageCount = () => {
      const pages = Math.max(editor.state.doc.childCount, 1);
      setPageCount(pages);
    };

    updatePageCount();

    editor.on("update", updatePageCount);
    editor.on("selectionUpdate", updatePageCount);

    return () => {
      editor.off("update", updatePageCount);
      editor.off("selectionUpdate", updatePageCount);
    };
  }, [editor]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    const handleInsert = (e: CustomEvent) => {
      const { text, color } = e.detail;

      if (color) {
        const highlightedText = `<mark data-color="${color}" style="background-color: ${color}; opacity: 0.3">${escapeHtml(text)}</mark>`;
        editor.chain().focus().insertContent(highlightedText + " ").run();
      } else {
        const paragraphHtml = buildPdfParagraphs(text) || `<p class="pdf-quote">${escapeHtml(text)}</p>`;
        editor.chain().focus().insertContent(paragraphHtml).run();
      }
    };

    window.addEventListener("insert-to-note", handleInsert as any);
    return () => {
      window.removeEventListener("insert-to-note", handleInsert as any);
    };
  }, [editor]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    lastSyncedHtmlRef.current = ensurePagedContent(editor.getHTML());
  }, [editor]);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  const handleAddPage = () => {
    if (!editor) return;
    if (editor.chain().focus("end").appendPage().run()) {
      lastSyncedHtmlRef.current = ensurePagedContent(editor.getHTML());
    }
  };

  const handleRemovePage = () => {
    if (!editor) return;
    if (pageCount <= 1) return;
    if (editor.chain().focus("end").removeLastPage().run()) {
      lastSyncedHtmlRef.current = ensurePagedContent(editor.getHTML());
    }
  };

  if (!editor) {
    return null;
  }

  const pageLabel = pageCount === 1 ? "page" : "pages";

  return (
    <div className="notebook-container">
      <div className="notebook-toolbar">
        <div className="toolbar-left">
          <span className="notebook-date">
            {new Date().toLocaleDateString("en-US", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric"
            })}
          </span>
        </div>

        <div className="toolbar-center">
          <div className="paper-tabs">
            {Object.entries(PAPER_STYLES).map(([key, style]) => (
              <button
                key={key}
                className={`paper-tab ${paperStyle === key ? "active" : ""}`}
                onClick={() => {
                  setPaperStyle(key);
                  editor.commands.focus();
                }}
                title={style.name}
              >
                <span className="tab-icon">{style.icon}</span>
                <span className="tab-name">{style.name}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="toolbar-right">
          <div className="page-controls">
            <button
              type="button"
              className="page-control-btn"
              onClick={handleAddPage}
            >
              + Page
            </button>
            <button
              type="button"
              className="page-control-btn"
              onClick={handleRemovePage}
              disabled={pageCount <= 1}
            >
              - Page
            </button>
            <span className="page-counter">
              {pageCount} {pageLabel}
            </span>
          </div>
          <span className="word-counter">{wordCount} words</span>
        </div>
      </div>

      <div className="format-bar">
        <div className="format-group">
          <button
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={`format-btn ${editor.isActive("bold") ? "active" : ""}`}
            title="Bold (Ctrl+B)"
          >
            <strong>B</strong>
          </button>
          <button
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={`format-btn ${editor.isActive("italic") ? "active" : ""}`}
            title="Italic (Ctrl+I)"
          >
            <em>I</em>
          </button>
          <button
            onClick={() => editor.chain().focus().toggleStrike().run()}
            className={`format-btn ${editor.isActive("strike") ? "active" : ""}`}
            title="Strikethrough"
          >
            <s>S</s>
          </button>
        </div>

        <div className="format-divider" />

        <div className="format-group">
          <div className="highlighter-palette">
            {["#fef08a", "#86efac", "#a5b4fc", "#fca5a5", "#e9d5ff"].map(color => (
              <button
                key={color}
                onClick={() => editor.chain().focus().toggleHighlight({ color }).run()}
                className={`highlighter ${editor.isActive("highlight", { color }) ? "active" : ""}`}
                style={{ "--highlight-color": color } as any}
                title="Highlight"
              />
            ))}
          </div>
        </div>

        <div className="format-divider" />

        <div className="format-group">
          <button
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            className={`format-btn ${editor.isActive("heading", { level: 1 }) ? "active" : ""}`}
            title="Heading 1"
          >
            H1
          </button>
          <button
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            className={`format-btn ${editor.isActive("heading", { level: 2 }) ? "active" : ""}`}
            title="Heading 2"
          >
            H2
          </button>
        </div>

        <div className="format-divider" />

        <div className="format-group">
          <button
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={`format-btn ${editor.isActive("bulletList") ? "active" : ""}`}
            title="Bullet List"
          >
            {"\u2022"}
          </button>
          <button
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className={`format-btn ${editor.isActive("orderedList") ? "active" : ""}`}
            title="Numbered List"
          >
            1.
          </button>
          <button
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            className={`format-btn ${editor.isActive("blockquote") ? "active" : ""}`}
            title="Quote"
          >
            {"\u275D"}
          </button>
        </div>

        <div className="format-divider" />

        <div className="format-group">
          <button
            onClick={() => editor.chain().focus().undo().run()}
            className="format-btn"
            disabled={!editor.can().undo()}
            title="Undo (Ctrl+Z)"
          >
            {"\u21B6"}
          </button>
          <button
            onClick={() => editor.chain().focus().redo().run()}
            className="format-btn"
            disabled={!editor.can().redo()}
            title="Redo (Ctrl+Y)"
          >
            {"\u21B7"}
          </button>
        </div>
      </div>

      <div className="notebook-workspace">
        <div className="notebook-editor-canvas">
          <EditorContent editor={editor} className="editor-content-wrapper" />
        </div>
      </div>
    </div>
  );
}

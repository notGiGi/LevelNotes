import React, { useEffect, useState, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Highlight from "@tiptap/extension-highlight";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { Note } from "../App";

const API = "http://127.0.0.1:3030";

const PAPER_STYLES = {
  blank: { name: "Blank", icon: "📄", className: "paper-blank" },
  lined: { name: "Lined", icon: "📝", className: "paper-lined" },
  grid: { name: "Grid", icon: "📊", className: "paper-grid" },
  dotted: { name: "Dotted", icon: "⚫", className: "paper-dotted" },
  cornell: { name: "Cornell", icon: "🎓", className: "paper-cornell" }
};

const PAGE_HEIGHT = 1056; // Keep in sync with app.css --paper-page-height

type Props = {
  note: Note;
  onUpdate: () => void;
};

export default function NoteEditor({ note, onUpdate }: Props) {
  const [paperStyle, setPaperStyle] = useState("lined");
  const [wordCount, setWordCount] = useState(0);
  const [extraPages, setExtraPages] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        blockquote: { HTMLAttributes: { class: "editor-blockquote" } }
      }),
      Highlight.configure({ multicolor: true }),
      TextStyle,
      Color,
      Image,
      Placeholder.configure({
        placeholder: ({ node }) => {
          if (node.type.name === 'heading' && node.attrs.level === 1) {
            return 'Title...'
          }
          if (node.type.name === 'heading') {
            return 'Heading...'
          }
          return 'Start writing your thoughts...'
        }
      })
    ],
    content: note.content || "",
    editorProps: {
      attributes: {
        class: `note-editor-text`,
        spellcheck: "false"
      }
    },
    onUpdate: ({ editor }) => {
      const text = editor.getText();
      setWordCount(text.split(/\s+/).filter(word => word.length > 0).length);
      
      // Debounce save
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      
      saveTimeoutRef.current = setTimeout(() => {
        saveNote(editor.getHTML(), editor.getText());
      }, 1000);
    }
  });

  // Actualizar contenido cuando cambia la nota
  useEffect(() => {
    if (editor && note.id) {
      editor.commands.setContent(note.content || "");
    }
  }, [note.id, editor]);

  useEffect(() => {
    const handleInsert = (e: CustomEvent) => {
      if (editor) {
        const { text, color } = e.detail;
        
        if (color) {
          const highlightedText = `<mark data-color="${color}" style="background-color: ${color}; opacity: 0.3">${text}</mark>`;
          editor.chain()
            .focus()
            .insertContent(highlightedText + ' ')
            .run();
        } else {
          editor.chain()
            .focus()
            .insertContent(`<blockquote class="pdf-quote">${text}</blockquote>`)
            .run();
        }
      }
    };

    window.addEventListener("insert-to-note", handleInsert as any);
    return () => {
      window.removeEventListener("insert-to-note", handleInsert as any);
    };
  }, [editor]);

  const saveNote = async (htmlContent: string, plainContent: string) => {
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
  };

  useEffect(() => {
    if (!editor) return;

    let frame: number | null = null;

    const scheduleUpdate = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = null;
        const dom = editor.view.dom as HTMLElement | null;
        if (!dom) return;

        const rawHeight = dom.scrollHeight;
        const extraHeight = extraPages * PAGE_HEIGHT;
        const adjustedHeight = Math.max(rawHeight - extraHeight, PAGE_HEIGHT);
        const computedPages = Math.max(1, Math.ceil(adjustedHeight / PAGE_HEIGHT));

        setPageCount(prev => (prev === computedPages ? prev : computedPages));
      });
    };

    scheduleUpdate();

    editor.on("update", scheduleUpdate);
    editor.on("selectionUpdate", scheduleUpdate);
    window.addEventListener("resize", scheduleUpdate);

    return () => {
      if (frame) {
        window.cancelAnimationFrame(frame);
      }
      editor.off("update", scheduleUpdate);
      editor.off("selectionUpdate", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, [editor, extraPages]);

  useEffect(() => {
    setExtraPages(0);
    setPageCount(1);
  }, [note.id]);

  const handleAddPage = () => {
    setExtraPages(prev => prev + 1);
    if (editor) {
      setTimeout(() => editor.commands.focus("end"), 0);
    }
  };

  const handleRemovePage = () => {
    setExtraPages(prev => (prev > 0 ? prev - 1 : 0));
  };


  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  if (!editor) return null;

  const basePages = Math.max(pageCount, 1);
  const totalPages = basePages + extraPages;
  const pageIndices = Array.from({ length: totalPages }, (_, index) => index);
  const pageLabel = totalPages === 1 ? "page" : "pages";

  return (
    <div className="notebook-container">
      <div className="notebook-toolbar">
        <div className="toolbar-left">
          <span className="notebook-date">
            {new Date().toLocaleDateString('en-US', { 
              weekday: 'long', 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric' 
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
                  if (editor) {
                    editor.commands.focus();
                  }
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
              disabled={extraPages === 0}
            >
              − Page
            </button>
            <span className="page-counter">
              {totalPages} {pageLabel}
            </span>
          </div>
          <span className="word-counter">
            {wordCount} words
          </span>
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
            •
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
            ❝
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
            ↶
          </button>
          <button
            onClick={() => editor.chain().focus().redo().run()}
            className="format-btn"
            disabled={!editor.can().redo()}
            title="Redo (Ctrl+Y)"
          >
            ↷
          </button>
        </div>
      </div>

      <div className="notebook-workspace">
        <div 
          className="notebook-paper-stack"
          style={{ height: `${totalPages * PAGE_HEIGHT}px` }}
        >
          {pageIndices.map(index => (
            <div
              key={`page-${index}`}
              className={`notebook-paper notebook-paper-surface ${PAPER_STYLES[paperStyle].className}`}
              style={{ top: `${index * PAGE_HEIGHT}px` }}
              aria-hidden="true"
            >
              <div className="paper-texture" />
            </div>
          ))}

          <EditorContent 
            editor={editor} 
            className="editor-content-wrapper"
            style={{ minHeight: `${totalPages * PAGE_HEIGHT}px` }}
          />

          <div className="page-footer-overlay-layer" aria-hidden="true">
            {pageIndices.map(index => (
              <div
                key={`footer-${index}`}
                className="page-footer-overlay"
                style={{
                  top: `${index * PAGE_HEIGHT}px`,
                  height: `${PAGE_HEIGHT}px`
                }}
              >
                <div className="page-footer">
                  <span className="page-number">Page {index + 1}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}


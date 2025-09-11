import React, { useEffect, useState, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Highlight from "@tiptap/extension-highlight";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import Image from "@tiptap/extension-image";
import { motion, AnimatePresence } from "framer-motion";
import { HexColorPicker } from "react-colorful";
import EmojiPicker from "emoji-picker-react";
import { Note } from "../App";

const API = "http://127.0.0.1:3030";

// Paper patterns with perfect alignment
const PAPER_STYLES = {
  blank: { name: "Blank", className: "paper-blank" },
  lined: { name: "Lined", className: "paper-lined" },
  grid: { name: "Grid", className: "paper-grid" },
  dotted: { name: "Dotted", className: "paper-dotted" },
  cornell: { name: "Cornell", className: "paper-cornell" }
};

type Props = {
  note: Note;
  onUpdate: () => void;
};

export default function NoteEditor({ note, onUpdate }: Props) {
  const [paperStyle, setPaperStyle] = useState("lined");
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [penColor, setPenColor] = useState("#000000");

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        blockquote: { HTMLAttributes: { class: "editor-blockquote" } }
      }),
      Highlight.configure({ multicolor: true }),
      TextStyle,
      Color,
      Image
    ],
    content: note.content || "<h1>Study Notes</h1><p>Start writing...</p>",
    editorProps: {
      attributes: {
        class: `note-editor-content ${PAPER_STYLES[paperStyle].className}`,
        spellcheck: "false"
      }
    },
    onUpdate: ({ editor }) => {
      saveNote(editor.getHTML());
    }
  });

  useEffect(() => {
    const handleInsert = (e: CustomEvent) => {
      if (editor) {
        const { text, color } = e.detail;
        
        if (color) {
          // Insert with highlight color
          const highlightedText = `<mark data-color="${color}" style="background-color: ${color}">${text}</mark>`;
          editor.chain()
            .focus()
            .insertContent(`<p>${highlightedText}</p>`)
            .run();
        } else {
          // Insert as quote without highlight
          editor.chain()
            .focus()
            .insertContent(`<blockquote class="pdf-quote"><p>${text}</p></blockquote>`)
            .run();
        }
      }
    };

    window.addEventListener("insert-to-note", handleInsert as any);
    return () => {
      window.removeEventListener("insert-to-note", handleInsert as any);
    };
  }, [editor]);

  const saveNote = async (content: string) => {
    try {
      await fetch(`${API}/update/${note.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: note.title,
          tags: note.tags
        })
      });
    } catch (e) {
      console.error("Failed to save:", e);
    }
  };

  if (!editor) return null;

  const ToolbarTop = () => (
    <div className="editor-toolbar-top">
      <div className="toolbar-section">
        <label className="toolbar-label">Paper Style</label>
        <div className="paper-selector">
          {Object.entries(PAPER_STYLES).map(([key, style]) => (
            <button
              key={key}
              className={`paper-option ${paperStyle === key ? "active" : ""}`}
              onClick={() => {
                setPaperStyle(key);
                editor.chain().focus().run();
              }}
              title={style.name}
            >
              <div className={`paper-preview ${style.className}`} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  const FormatToolbar = () => (
    <div className="editor-toolbar-modern">
      <div className="toolbar-group">
        <button
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={`toolbar-btn ${editor.isActive("bold") ? "active" : ""}`}
          title="Bold"
        >
          B
        </button>
        <button
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={`toolbar-btn ${editor.isActive("italic") ? "active" : ""}`}
          title="Italic"
        >
          I
        </button>
        <button
          onClick={() => editor.chain().focus().toggleStrike().run()}
          className={`toolbar-btn ${editor.isActive("strike") ? "active" : ""}`}
          title="Strike"
        >
          S
        </button>
      </div>

      <div className="toolbar-separator" />

      <div className="toolbar-group highlighter-group">
        {["#fef08a", "#86efac", "#a5b4fc", "#fca5a5", "#e9d5ff"].map(color => (
          <button
            key={color}
            onClick={() => editor.chain().focus().toggleHighlight({ color }).run()}
            className={`highlighter-btn ${editor.isActive("highlight", { color }) ? "active" : ""}`}
            style={{ backgroundColor: color }}
            title="Highlight"
          />
        ))}
      </div>

      <div className="toolbar-separator" />

      <div className="toolbar-group">
        {[1, 2, 3].map(level => (
          <button
            key={level}
            onClick={() => editor.chain().focus().toggleHeading({ level: level as any }).run()}
            className={`toolbar-btn ${editor.isActive("heading", { level }) ? "active" : ""}`}
          >
            H{level}
          </button>
        ))}
      </div>

      <div className="toolbar-separator" />

      <div className="toolbar-group">
        <button
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={`toolbar-btn ${editor.isActive("bulletList") ? "active" : ""}`}
          title="Bullet List"
        >
          •
        </button>
        <button
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={`toolbar-btn ${editor.isActive("orderedList") ? "active" : ""}`}
          title="Numbered List"
        >
          1.
        </button>
        <button
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          className={`toolbar-btn ${editor.isActive("blockquote") ? "active" : ""}`}
          title="Quote"
        >
          "
        </button>
      </div>
    </div>
  );

  return (
    <div className="notebook-editor">
      <ToolbarTop />
      <FormatToolbar />
      
      <div className="editor-workspace">
        <div className="editor-paper">
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  );
}

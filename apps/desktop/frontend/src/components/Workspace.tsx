import React, { useState, useRef } from "react";
import NoteEditor from "./NoteEditor";
import PdfViewer from "./PdfViewer";
import { Note } from "../App";

type Props = {
  note: Note;
  onUpdate: () => void;
};

export default function Workspace({ note, onUpdate }: Props) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [splitView, setSplitView] = useState(true);
  const [selectedText, setSelectedText] = useState<string>("");
  const [splitPosition, setSplitPosition] = useState(50);
  const isDragging = useRef(false);

  const handlePdfTextSelect = (text: string) => {
    setSelectedText(text);
  };

  const handleInsertToNote = (text: string, color?: string) => {
    // Send with color information
    const event = new CustomEvent("insert-to-note", { 
      detail: { text, color } 
    });
    window.dispatchEvent(event);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging.current) return;
    const container = document.querySelector(".workspace");
    if (!container) return;
    
    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = (x / rect.width) * 100;
    setSplitPosition(Math.min(80, Math.max(20, percentage)));
  };

  const handleMouseUp = () => {
    isDragging.current = false;
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);
  };

  const handleDragStart = () => {
    isDragging.current = true;
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  return (
    <div className="workspace">
      <div className="workspace-header">
        <div className="workspace-title">
          <h1>{note.title}</h1>
          <div className="workspace-actions">
            <button 
              className="workspace-btn"
              onClick={() => setSplitView(!splitView)}
              title={splitView ? "Hide PDF" : "Show PDF"}
            >
              {splitView ? "📖" : "📄"} {splitView ? "Single View" : "Split View"}
            </button>
            
            {!pdfUrl && (
              <label className="workspace-btn workspace-btn-primary">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M10 2v8m0 0l3-3m-3 3l-3-3M3 12v5a1 1 0 001 1h12a1 1 0 001-1v-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                </svg>
                Open PDF
                <input
                  type="file"
                  accept="application/pdf"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setPdfUrl(URL.createObjectURL(file));
                    }
                  }}
                />
              </label>
            )}
            
            {pdfUrl && (
              <button
                className="workspace-btn"
                onClick={() => setPdfUrl(null)}
                title="Close PDF"
              >
                ✕ Close PDF
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="workspace-content">
        <div 
          className="workspace-editor"
          style={{ width: splitView && pdfUrl ? `${splitPosition}%` : "100%" }}
        >
          <NoteEditor
            note={note}
            onUpdate={onUpdate}
          />
        </div>

        {splitView && pdfUrl && (
          <>
            <div 
              className="workspace-divider"
              onMouseDown={handleDragStart}
            >
              <div className="divider-handle">
                <svg width="4" height="40" viewBox="0 0 4 40" fill="currentColor" opacity="0.3">
                  <circle cx="2" cy="10" r="1.5"/>
                  <circle cx="2" cy="20" r="1.5"/>
                  <circle cx="2" cy="30" r="1.5"/>
                </svg>
              </div>
            </div>
            
            <div 
              className="workspace-pdf"
              style={{ width: `${100 - splitPosition}%` }}
            >
              <PdfViewer
                url={pdfUrl}
                onTextSelect={handlePdfTextSelect}
                onInsert={handleInsertToNote}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

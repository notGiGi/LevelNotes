import React, { useEffect, useRef, useState, useCallback } from "react";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { TextLayerBuilder } from "pdfjs-dist/web/pdf_viewer";

// Configurar worker
pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

const API = "http://127.0.0.1:3030";

type Props = {
  onClose: () => void;
  onClipped: () => void;
  targetNoteId?: string | null;
  targetNoteTitle?: string | null;
};

export default function PdfClipper({ onClose, onClipped, targetNoteId = null, targetNoteTitle = null }: Props) {
  const [mode, setMode] = useState<"append" | "new">(targetNoteId ? "append" : "new");
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.5);
  const [fileName, setFileName] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textLayerRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const onFileChange = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const f = ev.target.files?.[0];
    if (!f) return;
    
    setLoading(true);
    setFileName(f.name);
    
    try {
      const buf = await f.arrayBuffer();
      const doc = await pdfjsLib.getDocument({ data: buf }).promise;
      setPdfDoc(doc);
      setNumPages(doc.numPages || 0);
      setPage(1);
    } catch (err) {
      console.error("Error loading PDF:", err);
      alert("Error loading PDF file");
    } finally {
      setLoading(false);
    }
  };

  const renderPage = useCallback(async () => {
    if (!pdfDoc || !canvasRef.current || !textLayerRef.current) return;

    setLoading(true);

    try {
      const pg = await pdfDoc.getPage(page);
      const viewport = pg.getViewport({ scale });

      // Setup canvas with device pixel ratio for crisp rendering
      const canvas = canvasRef.current;
      const context = canvas.getContext("2d")!;
      const outputScale = window.devicePixelRatio || 1;
      canvas.width = Math.ceil(viewport.width * outputScale);
      canvas.height = Math.ceil(viewport.height * outputScale);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      context.setTransform(outputScale, 0, 0, outputScale, 0, 0);

      // Render PDF page
      await pg.render({ canvasContext: context, viewport }).promise;

      // Use PDF.js TextLayerBuilder for selectable text layer
      const host = textLayerRef.current;
      host.innerHTML = "";
      host.style.width = `${viewport.width}px`;
      host.style.height = `${viewport.height}px`;
      host.style.left = "0";
      host.style.top = "0";

      const builder = new TextLayerBuilder({ pdfPage: pg });
      await builder.render({ viewport });
      builder.div.style.width = `${viewport.width}px`;
      builder.div.style.height = `${viewport.height}px`;
      builder.div.style.left = "0";
      builder.div.style.top = "0";
      host.replaceWith(builder.div);
      // @ts-ignore keep ref current
      textLayerRef.current = builder.div;
    } catch (err) {
      console.error("Error rendering page:", err);
    } finally {
      setLoading(false);
    }
  }, [pdfDoc, page, scale]);

  useEffect(() => {
    renderPage();
  }, [renderPage]);

  const getSelectedText = (): string => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return "";
    
    const selectedText = selection.toString().trim();
    return selectedText;
  };

  const addSelection = async () => {
    const selectedText = getSelectedText();
    
    if (!selectedText) {
      alert("Please select some text from the PDF first");
      return;
    }
    
    const finalHtml = `<p>${selectedText.replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br>")}</p>`;
    
    try {
      if (mode === "append" && targetNoteId) {
        const payload = { 
          plaintext: selectedText,
          html: finalHtml, 
          tags: ["pdf"],
          page
        };
        const res = await fetch(`${API}/append/${targetNoteId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } else {
        const screenshotDataUrl = canvasRef.current?.toDataURL("image/png") || null;
        const payload = {
          source: { kind: "pdf", url: fileName },
          selection: { text: selectedText, html: finalHtml },
          media: { screenshotDataUrl },
          ops: { tags: ["pdf"], page }
        };
        const res = await fetch(`${API}/clip`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      }
      
      window.getSelection()?.removeAllRanges();
      onClipped();
      onClose();
    } catch (e) {
      alert(`Error saving to LevelNotes: ${e}`);
      console.error(e);
    }
  };

  const changePage = (delta: number) => {
    const newPage = page + delta;
    if (newPage >= 1 && newPage <= numPages) {
      setPage(newPage);
      window.getSelection()?.removeAllRanges();
    }
  };

  const changeScale = (delta: number) => {
    const newScale = Math.max(0.5, Math.min(3, scale + delta));
    setScale(newScale);
  };

  return (
    <div className="pdf-modal">
      <div className="pdf-toolbar">
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <label className="button" htmlFor="pdf-input" style={{ opacity: loading ? 0.5 : 1 }}>
            {loading ? "Loading..." : "Open PDF"}
          </label>
          <input 
            id="pdf-input" 
            type="file" 
            accept="application/pdf" 
            style={{ display: "none" }} 
            onChange={onFileChange}
            disabled={loading}
          />
          <span className="pdf-filename">{fileName || "No file loaded"}</span>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button 
            className="button" 
            onClick={() => changeScale(0.25)}
            disabled={!pdfDoc || loading}
          >
            Zoom +
          </button>
          <button 
            className="button" 
            onClick={() => changeScale(-0.25)}
            disabled={!pdfDoc || loading}
          >
            Zoom -
          </button>
          <span style={{ fontSize: 14, opacity: 0.7 }}>{Math.round(scale * 100)}%</span>
          
          <div style={{ width: 1, height: 20, background: "#e7e7e7" }} />
          
          <button 
            className="button" 
            onClick={() => changePage(-1)} 
            disabled={page <= 1 || loading}
          >
            ← Prev
          </button>
          <span style={{ minWidth: 80, textAlign: "center" }}>
            Page {page} / {numPages || "?"}
          </span>
          <button 
            className="button" 
            onClick={() => changePage(1)} 
            disabled={!numPages || page >= numPages || loading}
          >
            Next →
          </button>
          
          <div style={{ width: 1, height: 20, background: "#e7e7e7" }} />
          
          <button 
            className="button" 
            onClick={addSelection} 
            disabled={!pdfDoc || loading}
            style={{ 
              background: getSelectedText() ? "#28a745" : "var(--brand)",
              fontWeight: getSelectedText() ? "bold" : "normal"
            }}
          >
            {getSelectedText() ? "✓ Add Selected Text" : "Select text to add"}
          </button>
          
          <button className="close" onClick={onClose}>✕ Close</button>
        </div>

        <div style={{ display: "flex", gap: 14, alignItems: "center", marginTop: 4 }}>
          <label style={{ cursor: targetNoteId ? "pointer" : "not-allowed", opacity: targetNoteId ? 1 : 0.5 }}>
            <input 
              type="radio" 
              checked={mode === "append"} 
              onChange={() => setMode("append")} 
              disabled={!targetNoteId} 
            /> 
            Append to active note {targetNoteTitle ? `"${targetNoteTitle}"` : ""}
          </label>
          <label style={{ cursor: "pointer" }}>
            <input 
              type="radio" 
              checked={mode === "new"} 
              onChange={() => setMode("new")} 
            /> 
            Create new note
          </label>
        </div>
      </div>

      <div className="pdf-view" ref={containerRef}>
        <div className="pdf-page" style={{ 
          position: "relative", 
          margin: "0 auto",
          boxShadow: "0 4px 20px rgba(0,0,0,0.1)",
          background: "white"
        }}>
          <canvas 
            ref={canvasRef} 
            className="pdf-canvas"
            style={{ display: "block" }}
          />
          <div 
            ref={textLayerRef} 
            className="textLayer"
          />
        </div>
        {loading && (
          <div style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            background: "rgba(255,255,255,0.9)",
            padding: "20px",
            borderRadius: "8px",
            boxShadow: "0 2px 10px rgba(0,0,0,0.1)"
          }}>
            Loading page {page}...
          </div>
        )}
      </div>
    </div>
  );
}

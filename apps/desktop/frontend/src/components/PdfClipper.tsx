import React, { useEffect, useRef, useState } from "react";
// PDF.js (legacy ESM so we can set workerSrc easily)
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
// @ts-ignore: web helper shipped by pdf.js
import { TextLayer } from "pdfjs-dist/web/text_layer_builder.js";

const API = "http://127.0.0.1:3030";
(pdfjsLib as any).GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

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
  const [scale, setScale] = useState<number>(1.25);
  const [fileName, setFileName] = useState<string>("");

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textLayerRef = useRef<HTMLDivElement | null>(null);

  const onFileChange = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const f = ev.target.files?.[0];
    if (!f) return;
    setFileName(f.name);
    const buf = await f.arrayBuffer();
    const doc = await (pdfjsLib as any).getDocument({ data: buf }).promise;
    setPdfDoc(doc);
    setNumPages(doc.numPages || 0);
    setPage(1);
  };

  useEffect(() => {
    (async () => {
      if (!pdfDoc || !canvasRef.current || !textLayerRef.current) return;
      const pg = await pdfDoc.getPage(page);
      const viewport = pg.getViewport({ scale });

      const canvas = canvasRef.current;
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const ctx = canvas.getContext("2d")!;
      await pg.render({ canvasContext: ctx, viewport }).promise;

      const textLayerDiv = textLayerRef.current!;
      textLayerDiv.style.width = `${canvas.width}px`;
      textLayerDiv.style.height = `${canvas.height}px`;
      textLayerDiv.innerHTML = "";

      const textContent = await pg.getTextContent();
      const layer = new (TextLayer as any)({
        textContentSource: textContent,
        container: textLayerDiv,
        viewport,
        enhanceTextSelection: true,
        isOffscreenCanvasSupported: false,
      });
      await layer.render();
    })();
  }, [pdfDoc, page, scale]);

  function getSelectedFromLayer(): { text: string; html: string } {
    const root = textLayerRef.current;
    const sel = window.getSelection();
    if (!root || !sel || sel.rangeCount === 0) return { text: "", html: "" };
    const range = sel.getRangeAt(0);
    if (!root.contains(range.commonAncestorContainer)) return { text: "", html: "" };
    const frag = range.cloneContents();
    const div = document.createElement("div");
    div.appendChild(frag);
    return { text: sel.toString().trim(), html: div.innerHTML };
  }

  const addSelection = async () => {
    const pick = getSelectedFromLayer();
    const finalText = pick.text || `Page ${page} — ${fileName}`;
    const finalHtml = pick.html || `<p>${finalText}</p>`;
    try {
      if (mode === "append" && targetNoteId) {
        const payload = { plaintext: finalText, html: finalHtml, tags: ["pdf"], page };
        await fetch(`${API}/append/${targetNoteId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        const payload = {
          source: { kind: "pdf", url: null },
          selection: { text: finalText, html: finalHtml },
          media: { screenshotDataUrl: canvasRef.current?.toDataURL("image/png") },
          ops: { summarize: false, tags: ["pdf"], page },
        };
        await fetch(`${API}/clip`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      onClipped();
    } catch (e) {
      alert("Could not send clip to LevelNotes.");
      console.warn(e);
    }
  };

  return (
    <div className="pdf-modal">
      <div className="pdf-toolbar">
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <label className="button" htmlFor="pdf-input">Open PDF</label>
          <input id="pdf-input" type="file" accept="application/pdf" style={{ display: "none" }} onChange={onFileChange} />
          <span className="pdf-filename">{fileName || "No file loaded"}</span>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button className="button" onClick={() => setScale(s => Math.min(3, s + 0.25))}>Zoom +</button>
          <button className="button" onClick={() => setScale(s => Math.max(0.5, s - 0.25))}>Zoom -</button>
          <button className="button" onClick={() => setPage(n => Math.max(1, n - 1))} disabled={page <= 1}>Prev</button>
          <span>Page {page}/{numPages || "?"}</span>
          <button className="button" onClick={() => setPage(n => Math.min((numPages || n), n + 1))} disabled={!numPages || page >= numPages}>Next</button>
          <button className="button" onClick={addSelection} disabled={!pdfDoc}>Add selection to LevelNotes</button>
          <button className="close" onClick={onClose}>Close</button>
        </div>

        <div style={{ display: "flex", gap: 14, alignItems: "center", marginTop: 4 }}>
          <label><input type="radio" checked={mode==="append"} onChange={() => setMode("append")} disabled={!targetNoteId} /> Append to active note {targetNoteTitle ? `(${targetNoteTitle})` : ""}</label>
          <label><input type="radio" checked={mode==="new"} onChange={() => setMode("new")} /> New note</label>
        </div>
      </div>

      <div className="pdf-view">
        <div className="pdf-page" style={{ position: "relative" }}>
          <canvas ref={canvasRef} className="pdf-canvas" />
          <div ref={textLayerRef} className="textLayer" />
        </div>
      </div>
    </div>
  );
}

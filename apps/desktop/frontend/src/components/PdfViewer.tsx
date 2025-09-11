import React, { useState, useRef, useEffect, useCallback } from "react";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { PDFPageView, EventBus } from "pdfjs-dist/web/pdf_viewer";

pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

type Props = {
  url: string;
  onTextSelect: (text: string) => void;
  onInsert: (text: string, color?: string) => void;
};

export default function PdfViewer({ url, onTextSelect, onInsert }: Props) {
  const [pdf, setPdf] = useState<any>(null);
  const [pageNum, setPageNum] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1.3);
  const [selectedText, setSelectedText] = useState("");
  const [loading, setLoading] = useState(true);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const eventBusRef = useRef<any>(null);

  // Load PDF
  useEffect(() => {
    if (!url) return;
    
    setLoading(true);
    pdfjsLib.getDocument(url).promise.then(pdfDoc => {
      setPdf(pdfDoc);
      setNumPages(pdfDoc.numPages);
      setLoading(false);
    }).catch(err => {
      console.error("Error loading PDF:", err);
      setLoading(false);
    });
  }, [url]);

  // Render page with correct text alignment
  const renderPage = useCallback(async () => {
    if (!pdf || !containerRef.current) return;

    try {
      const page = await pdf.getPage(pageNum);
      // Use official PDFPageView to render canvas + text layer in sync
      const container = containerRef.current;
      container.innerHTML = "";
      if (!eventBusRef.current) {
        eventBusRef.current = new EventBus();
      }
      const defaultViewport = page.getViewport({ scale: 1 });
      const pageView = new PDFPageView({
        container,
        id: page.pageNumber,
        scale,
        defaultViewport,
        eventBus: eventBusRef.current,
        textLayerMode: 2,
        annotationMode: 0,
      });
      await pageView.setPdfPage(page);
      await pageView.draw();

      // Auto-align text layer to canvas if any sub-pixel offset exists
      try {
        const canvasEl = container.querySelector('canvas');
        const textLayerEl = container.querySelector('.textLayer');
        if (canvasEl && textLayerEl) {
          const cr = (canvasEl as HTMLCanvasElement).getBoundingClientRect();
          const tr = (textLayerEl as HTMLElement).getBoundingClientRect();
          const dx = Math.round(tr.left - cr.left);
          const dy = Math.round(tr.top - cr.top);
          if (dx !== 0 || dy !== 0) {
            const existing = (textLayerEl as HTMLElement).style.transform || '';
            const translate = ` translate(${-dx}px, ${-dy}px)`;
            (textLayerEl as HTMLElement).style.transform = `${existing}${translate}`.trim();
            (textLayerEl as HTMLElement).style.willChange = 'transform';
          }
        }
      } catch {}
      
    } catch (err) {
      console.error("Error rendering page:", err);
    }
  }, [pdf, pageNum, scale]);

  useEffect(() => {
    renderPage();
  }, [renderPage]);

  // Handle text selection
  const handleMouseUp = useCallback(() => {
    setTimeout(() => {
      const selection = window.getSelection();
      if (selection && selection.toString().trim()) {
        const text = selection.toString().trim();
        setSelectedText(text);
        onTextSelect(text);
        showFloatingButton(selection);
      }
    }, 50);
  }, [onTextSelect]);

  const showFloatingButton = (selection: Selection) => {
    try {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      
      // Remove existing
      const existing = document.getElementById("pdf-floater");
      if (existing) existing.remove();
      
      // Create floater
      const floater = document.createElement("div");
      floater.id = "pdf-floater";
      floater.className = "pdf-floating-panel";
      floater.style.cssText = `
        position: fixed;
        left: ${rect.left + rect.width / 2}px;
        top: ${rect.top - 60}px;
        transform: translateX(-50%);
        z-index: 10000;
      `;
      
      floater.innerHTML = `
        <div class="pdf-float-actions">
          <button class="pdf-action-main">
            ➕ Add to Note
          </button>
          <div class="pdf-float-divider"></div>
          <div class="pdf-highlight-group">
            <button class="pdf-highlight-option" data-color="#fef08a" style="background: #fef08a"></button>
            <button class="pdf-highlight-option" data-color="#86efac" style="background: #86efac"></button>
            <button class="pdf-highlight-option" data-color="#a5b4fc" style="background: #a5b4fc"></button>
            <button class="pdf-highlight-option" data-color="#fca5a5" style="background: #fca5a5"></button>
          </div>
        </div>
      `;
      
      document.body.appendChild(floater);
      
      // Add to note
      floater.querySelector(".pdf-action-main")?.addEventListener("click", () => {
        onInsert(selectedText);
        window.getSelection()?.removeAllRanges();
        floater.remove();
      });
      
      // Color buttons
      floater.querySelectorAll(".pdf-highlight-option").forEach(btn => {
        btn.addEventListener("click", (e) => {
          const color = (e.target as HTMLElement).dataset.color!;
          onInsert(selectedText, color);
          window.getSelection()?.removeAllRanges();
          floater.remove();
        });
      });
    } catch (e) {
      console.error("Error showing floating button:", e);
    }
  };

  // Hide floater on click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (!(e.target as Element).closest("#pdf-floater")) {
        document.getElementById("pdf-floater")?.remove();
      }
    };
    
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  return (
    <div className="pdf-container">
      <div className="pdf-toolbar-modern">
        <div className="pdf-control-group">
          <button 
            className="pdf-control-btn"
            onClick={() => setPageNum(Math.max(1, pageNum - 1))}
            disabled={pageNum <= 1}
          >
            ◀
          </button>
          
          <div className="pdf-page-display">
            <span>{pageNum}</span>
            <span className="pdf-page-separator">/</span>
            <span>{numPages}</span>
          </div>
          
          <button 
            className="pdf-control-btn"
            onClick={() => setPageNum(Math.min(numPages, pageNum + 1))}
            disabled={pageNum >= numPages}
          >
            ▶
          </button>
        </div>
        
        <div className="pdf-toolbar-separator" />
        
        <div className="pdf-control-group">
          <button 
            className="pdf-control-btn"
            onClick={() => setScale(Math.max(0.5, scale - 0.1))}
            disabled={scale <= 0.5}
          >
            −
          </button>
          
          <div className="pdf-zoom-display">
            {Math.round(scale * 100)}%
          </div>
          
          <button 
            className="pdf-control-btn"
            onClick={() => setScale(Math.min(3, scale + 0.1))}
            disabled={scale >= 3}
          >
            +
          </button>
          
          <button 
            className="pdf-control-btn"
            onClick={() => setScale(1.3)}
          >
            ↻
          </button>
        </div>
      </div>

      <div className="pdf-viewport" onMouseUp={handleMouseUp}>
        {loading ? (
          <div className="pdf-loading-state">
            <div className="pdf-spinner" />
            <p>Loading PDF...</p>
          </div>
        ) : (
          <div className="pdf-page-container" ref={containerRef} />
        )}
      </div>
    </div>
  );
}

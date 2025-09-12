import React, { useState, useRef, useEffect, useCallback } from "react";
import * as pdfjsLib from "pdfjs-dist";

// Configure worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js`;

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

  // Render page with CORRECT alignment
  const renderPage = useCallback(async () => {
    if (!pdf || !canvasRef.current || !textLayerRef.current || !containerRef.current) return;

    try {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale });
      
      // Setup canvas
      const canvas = canvasRef.current;
      const context = canvas.getContext("2d");
      
      if (!context) return;
      
      // IMPORTANT: Set canvas size
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      
      // CRITICAL: Set container size to match canvas exactly
      const container = containerRef.current;
      container.style.width = viewport.width + "px";
      container.style.height = viewport.height + "px";

      // Render PDF
      await page.render({
        canvasContext: context,
        viewport: viewport,
      }).promise;

      // Setup text layer - MUST match canvas exactly
      const textLayerDiv = textLayerRef.current;
      textLayerDiv.innerHTML = "";
      
      // CRITICAL: Same dimensions as canvas, NO offset
      textLayerDiv.style.width = viewport.width + "px";
      textLayerDiv.style.height = viewport.height + "px";
      textLayerDiv.style.left = "0";
      textLayerDiv.style.top = "0";

      // Get text content
      const textContent = await page.getTextContent();
      
      // Build text layer
      textContent.items.forEach((item: any) => {
        if (!item.str || item.str.trim() === "") return;

        const span = document.createElement("span");
        span.textContent = item.str;

        // EXACT transform - no modifications
        const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
        const fontSize = Math.sqrt((tx[2] * tx[2]) + (tx[3] * tx[3]));
        
        // EXACT positioning from transform
        span.style.cssText = `
          position: absolute;
          left: ${tx[4]}px;
          top: ${tx[5] - fontSize}px;
          font-size: ${fontSize}px;
          font-family: ${item.fontName || "sans-serif"};
          color: transparent;
          cursor: text;
          user-select: text;
          -webkit-user-select: text;
          white-space: pre;
          transform-origin: 0% 0%;
          line-height: 1;
        `;
        
        // Only apply rotation if significant
        const angle = Math.atan2(tx[1], tx[0]);
        if (Math.abs(angle) > 0.01) {
          span.style.transform = `rotate(${angle}rad)`;
        }
        
        textLayerDiv.appendChild(span);
        
        if (item.hasEOL) {
          const br = document.createElement("br");
          br.style.userSelect = "none";
          textLayerDiv.appendChild(br);
        }
      });

      // Normalize text nodes
      textLayerDiv.normalize();
      
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
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    
    // Remove existing
    const existingFloater = document.getElementById("pdf-floater");
    if (existingFloater) existingFloater.remove();
    
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
      btn.addEventListener("click", () => {
        const color = btn.getAttribute("data-color")!;
        highlightSelection(selection, color);
        onInsert(selectedText, color);
        floater.remove();
      });
    });
  };

  const highlightSelection = (selection: Selection, color: string) => {
    const range = selection.getRangeAt(0);
    const mark = document.createElement("mark");
    mark.style.backgroundColor = color;
    mark.style.padding = "2px 0";
    mark.style.borderRadius = "2px";
    mark.style.opacity = "0.5";
    
    try {
      range.surroundContents(mark);
    } catch (e) {
      const contents = range.extractContents();
      mark.appendChild(contents);
      range.insertNode(mark);
    }
    
    selection.removeAllRanges();
  };

  // Hide floater
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
            <span>Page {pageNum} / {numPages}</span>
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
          <div className="pdf-page" ref={containerRef}>
            <canvas ref={canvasRef} className="pdf-canvas" />
            <div ref={textLayerRef} className="textLayer" />
          </div>
        )}
      </div>
    </div>
  );
}

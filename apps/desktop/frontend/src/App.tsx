import React, { useEffect, useMemo, useRef, useState } from "react";
import { NoteCard, type NoteListItem } from "./components/NoteCard";
import PdfClipper from "./components/PdfClipper";
import NoteEditor from "./components/NoteEditor";
import SettingsPanel from "./components/SettingsPanel";

type NoteDetail = {
  id: string;
  created_at: string;
  title: string;
  plaintext?: string | null;
  html?: string | null;
  source_url?: string | null;
  text_quote?: string | null;
  tags: string[];
  preview_path?: string | null;
  page_number?: number | null;
  highlights?: any[];
};

const API = "http://127.0.0.1:3030";

export default function App() {
  const [notes, setNotes] = useState<NoteListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [showPdf, setShowPdf] = useState(false);
  const [selected, setSelected] = useState<NoteDetail | null>(null);
  const [health, setHealth] = useState<"idle" | "ok" | "bad">("idle");
  const [theme, setTheme] = useState(localStorage.getItem("theme") || "light");
  const [focusMode, setFocusMode] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  const fetchSearch = async (query: string, signal?: AbortSignal) => {
    setErr(null);
    try {
      const r = await fetch(`${API}/search?q=${encodeURIComponent(query)}`, { signal });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      setNotes(data);
    } catch (e: any) {
      if (e.name !== "AbortError") {
        setErr(String(e));
      }
    }
  };

  const refreshNotes = async () => {
    await fetchSearch(q);
  };

  useEffect(() => {
    setLoading(true);
    fetchSearch("").finally(() => setLoading(false));
    
    // Check API health
    fetch(`${API}/health`)
      .then(r => r.text())
      .then(t => setHealth(t.trim() === "ok" ? "ok" : "bad"))
      .catch(() => setHealth("bad"));
  }, []);

  useEffect(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    fetchSearch(q, controller.signal).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [q]);

  const openDetail = async (id: string) => {
    try {
      const r = await fetch(`${API}/note/${id}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setSelected(await r.json());
    } catch {
      alert("Could not load note details.");
    }
  };

  const createNote = async () => {
    try {
      const payload = {
        source: { kind: "web", url: "" },
        selection: { text: "New note", html: "<p>Start writing...</p>" },
        ops: { tags: ["new"] }
      };
      await fetch(`${API}/clip`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      await refreshNotes();
    } catch {
      alert("Could not create note.");
    }
  };

  const filtered = useMemo(() => notes, [notes]);

  return (
    <div className={`app ${focusMode ? "focus-mode" : ""}`}>
      <header className="header">
        <div className="header-content">
          <div className="logo">
            <div className="logo-icon">📚</div>
            <span>LevelNotes</span>
          </div>
          
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <span className={`status status-${health === "ok" ? "success" : "danger"}`}>
              <span className="status-dot">●</span>
              API {health === "ok" ? "Online" : "Offline"}
            </span>
          </div>
        </div>
      </header>

      <div className="toolbar">
        <div className="toolbar-content">
          <button className="btn btn-primary" onClick={createNote}>
            <span>✏️</span> New Note
          </button>
          
          <button className="btn" onClick={() => setShowPdf(true)}>
            <span>📄</span> Import PDF
          </button>
          
          <button className="btn btn-ghost" onClick={refreshNotes}>
            <span>🔄</span>
          </button>
          
          <div className="spacer" />
          
          <div className="search-container">
            <span className="search-icon">🔍</span>
            <input
              className="search-input"
              placeholder="Search notes..."
              value={q}
              onChange={e => setQ(e.target.value)}
            />
          </div>
          
          <button 
            className="btn btn-ghost btn-icon"
            onClick={() => setFocusMode(!focusMode)}
            title="Focus Mode"
          >
            {focusMode ? "👁️" : "🎯"}
          </button>
        </div>
      </div>

      <main className="container">
        {loading && (
          <div className="empty-state">
            <div className="empty-state-icon">⏳</div>
            <div className="empty-state-title">Loading...</div>
          </div>
        )}
        
        {err && (
          <div className="status status-danger" style={{ margin: "24px 0" }}>
            {err}
          </div>
        )}
        
        {!loading && filtered.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-icon">📝</div>
            <div className="empty-state-title">No notes yet</div>
            <div className="empty-state-text">
              Create your first note or import a PDF to get started
            </div>
          </div>
        )}

        <div className="notes-grid">
          {filtered.map(n => (
            <NoteCard 
              key={n.id} 
              item={n} 
              onOpen={openDetail}
              isSelected={selected?.id === n.id}
            />
          ))}
        </div>
      </main>

      {/* PDF Modal */}
      {showPdf && (
        <div className="modal-overlay" onClick={() => setShowPdf(false)}>
          <div className="modal" style={{ maxWidth: "1400px" }} onClick={e => e.stopPropagation()}>
            <PdfClipper
              onClose={() => setShowPdf(false)}
              onClipped={async () => {
                setShowPdf(false);
                await refreshNotes();
              }}
              targetNoteId={selected?.id}
              targetNoteTitle={selected?.title}
            />
          </div>
        </div>
      )}

      {/* Note Editor Modal */}
      {selected && (
        <NoteEditor
          note={selected}
          onClose={() => setSelected(null)}
          onUpdate={async (updated) => {
            setSelected(updated);
            await refreshNotes();
          }}
          onDelete={async () => {
            setSelected(null);
            await refreshNotes();
          }}
        />
      )}

      {/* Settings Panel */}
      <SettingsPanel
        theme={theme}
        onThemeChange={setTheme}
        focusMode={focusMode}
        onFocusModeChange={setFocusMode}
      />
    </div>
  );
}

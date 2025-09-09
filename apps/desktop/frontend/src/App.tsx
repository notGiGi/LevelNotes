import React, { useEffect, useMemo, useRef, useState, Suspense } from "react";
import { NoteCard, type NoteListItem } from "./components/NoteCard";

import PdfClipper from "./components/PdfClipper";
type NoteDetail = {
  id: string; created_at: string; title: string;
  plaintext?: string | null; html?: string | null;
  source_url?: string | null; text_quote?: string | null;
  tags: string[]; preview_path?: string | null;
  page_number?: number | null; highlights?: any[];
};

const API = "http://127.0.0.1:3030";

export default function App() {
  const [notes, setNotes] = useState<NoteListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [showPdf, setShowPdf] = useState(false);
  const [selected, setSelected] = useState<NoteDetail | null>(null);
  const [opening, setOpening] = useState(false);
  const [health, setHealth] = useState<"idle" | "ok" | "bad">("idle");
  const abortRef = useRef<AbortController | null>(null);

  const fetchSearch = async (query: string, signal?: AbortSignal) => {
    setErr(null);
    const r = await fetch(`${API}/search?q=${encodeURIComponent(query)}`, { signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    setNotes(await r.json());
  };

  useEffect(() => {
    setLoading(true);
    fetchSearch("").catch(e => setErr(String(e))).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    fetchSearch(q, controller.signal)
      .catch(e => { if ((e as any).name !== "AbortError") setErr(String(e)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [q]);

  const openDetail = async (id: string) => {
    setOpening(true);
    try {
      const r = await fetch(`${API}/note/${id}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setSelected(await r.json());
    } catch { alert("Could not load note details."); }
    finally { setOpening(false); }
  };

  const createSample = async () => {
    try {
      const payload = { source:{kind:"web", url:"https://example.com"}, selection:{ text:"Sample note from frontend", html:"<b>Sample</b> note from frontend" }, ops:{ summarize:false, tags:["demo","test"] } };
      await fetch(`${API}/clip`, { method:"POST", headers:{ "Content-Type":"application/json" }, body:JSON.stringify(payload) });
      setQ(prev => prev);
    } catch { alert("Could not create the sample note."); }
  };

  const deleteSelected = async () => {
    if (!selected) return;
    if (!confirm("Delete this note? This cannot be undone.")) return;
    setOpening(true);
    try {
      await fetch(`${API}/delete/${selected.id}`, { method: "POST" });
      setSelected(null);
      setQ(prev => prev);
    } catch { alert("Could not delete the note."); }
    finally { setOpening(false); }
  };

  const pingHealth = async () => {
    try {
      const r = await fetch(`${API}/health`);
      const t = await r.text();
      setHealth(r.ok && t.trim()==="ok" ? "ok" : "bad");
    } catch { setHealth("bad"); }
  };

  const filtered = useMemo(() => notes, [notes]);

  return (
    <div className="container">
      <div className="header"><h1>LevelNotes</h1></div>

      <div className="toolbar">
        <button className="button" onClick={() => setShowPdf(true)}>Open PDF</button>
        <button className="button" onClick={pingHealth}>Health</button>
        <span className={`pill ${health}`}>{health==="ok"?"OK":health==="bad"?"DOWN":"—"}</span>
        <button className="button" onClick={() => setQ(q => q)}>Refresh</button>
        <button className="button" onClick={createSample}>Add sample note</button>
        <input className="input" placeholder="Search (title, text, url, tag)" value={q} onChange={e => setQ(e.target.value)} />
      </div>

      {loading && <p>Loading…</p>}
      {err && <p style={{ color: "crimson" }}>{err}</p>}
      {!loading && filtered.length === 0 && (<p className="empty">No notes yet (or no results). Create one or use the browser extension.</p>)}

      <div className="grid">{filtered.map(n => (<NoteCard key={n.id} item={n} onOpen={openDetail} />))}</div>

      {/* PDF modal (lazy) */}
      {showPdf && (
        <div className="modal-backdrop" onClick={() => setShowPdf(false)}>
          <div className="modal" style={{ width:"min(1000px,95vw)" }} onClick={e => e.stopPropagation()}>
            <Suspense fallback={<div>Loading PDF…</div>}>
            </Suspense>
          </div>
        </div>
      )}

            {/* PDF modal */}
      {showPdf && (
        <div className="modal-backdrop" onClick={() => setShowPdf(false)}>
          <div className="modal" style={{ width: "min(1000px, 95vw)" }} onClick={e => e.stopPropagation()}>
          </div>
        </div>
      )}
      {/* PDF modal */}
      {showPdf && (
        <div className="modal-backdrop" onClick={() => setShowPdf(false)}>
          <div className="modal" style={{ width: "min(1000px, 95vw)" }} onClick={e => e.stopPropagation()}>
            <PdfClipper
              onClose={() => setShowPdf(false)}
              onClipped={() => { setShowPdf(false); setQ(q => q); }}
              targetNoteId={selected ? selected.id : null}
              targetNoteTitle={selected ? selected.title : null}
            />
          </div>
        </div>
      )}
{/* Details modal */}
      {selected && (
        <div className="modal-backdrop" onClick={() => setSelected(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="top">
              <div>
                <h2>{selected.title}</h2>
                <div className="meta">
                  <span>{new Date(selected.created_at).toLocaleString()}</span>
                  {selected.source_url ? (<><span>·</span><a className="link" href={selected.source_url} target="_blank" rel="noreferrer">{selected.source_url}</a></>) : null}
                </div>
                {selected.tags?.length ? (<div className="tags" style={{ marginBottom: 8 }}>{selected.tags.map(t => <span key={t} className="tag">#{t}</span>)}</div>) : null}
              </div>
              <div style={{ display:"flex", gap:8 }}>
                <button className="close" onClick={() => setSelected(null)} disabled={opening}>Close</button>
                <button className="button" onClick={deleteSelected} disabled={opening}>Delete</button>
                <button className="button" onClick={() => { if (selected) window.open(`${API}/export/${selected.id}.md`, "_blank"); }} disabled={opening}>Export .md</button>
              </div>
            </div>

            {selected.plaintext ? (<div style={{ whiteSpace:"pre-wrap", lineHeight:1.5, marginTop:6 }}>{selected.plaintext}</div>) : null}
            {selected.html ? (<div className="html" style={{ marginTop:10 }} dangerouslySetInnerHTML={{ __html: selected.html }} />) : null}
          </div>
        </div>
      )}
    </div>
  );
}





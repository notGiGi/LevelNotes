import React from "react";
export type NoteListItem = {
  id: string; title: string; created_at: string;
  source_url?: string | null; tags: string[];
  snippet?: string | null; preview_path?: string | null;
};
export function NoteCard({ item, onOpen }: { item: NoteListItem; onOpen: (id: string) => void }) {
  return (
    <div className="card" onClick={() => onOpen(item.id)}>
      {item.preview_path ? (
        <img className="thumb" src={`http://127.0.0.1:3030/file/${item.preview_path}`} alt="" />
      ) : <div className="thumb" />}
      <div style={{ flex: 1 }}>
        <div className="title">{item.title || "Untitled"}</div>
        <div className="meta">
          <span>{new Date(item.created_at).toLocaleString()}</span>
          {item.source_url ? (<><span>·</span><a className="link" href={item.source_url} onClick={e => e.stopPropagation()} target="_blank" rel="noreferrer">{item.source_url}</a></>) : null}
        </div>
        {item.tags?.length ? (<div className="tags" style={{ marginTop: 6 }}>{item.tags.map(t => <span key={t} className="tag">#{t}</span>)}</div>) : null}
        {item.snippet ? <div style={{ marginTop: 6, color: "#333" }}>{item.snippet}</div> : null}
      </div>
    </div>
  );
}

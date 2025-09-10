import React from "react";

export type NoteListItem = {
  id: string;
  title: string;
  created_at: string;
  source_url?: string | null;
  tags: string[];
  snippet?: string | null;
  preview_path?: string | null;
};

export function NoteCard({ item, onOpen }: { item: NoteListItem; onOpen: (id: string) => void }) {
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) return "Today";
    if (days === 1) return "Yesterday";
    if (days < 7) return `${days} days ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="card" onClick={() => onOpen(item.id)}>
      <div className="card-header">
        {item.preview_path ? (
          <img className="thumb" src={`http://127.0.0.1:3030/file/${item.preview_path}`} alt="" />
        ) : (
          <div className="thumb" style={{ display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, opacity: 0.3 }}>
            📄
          </div>
        )}
        
        <div className="card-content">
          <div className="title">{item.title || "Untitled"}</div>
          
          <div className="meta">
            <span>📅 {formatDate(item.created_at)}</span>
            {item.source_url && <span title={item.source_url}>🔗</span>}
          </div>
          
          {item.snippet && (
            <div style={{ marginTop: 8, color: "var(--text-muted)", fontSize: 13, lineHeight: 1.5 }}>
              {item.snippet}
            </div>
          )}
        </div>
      </div>
      
      {item.tags?.length > 0 && (
        <div className="tags">
          {item.tags.map(t => (
            <span key={t} className="tag">#{t}</span>
          ))}
        </div>
      )}
    </div>
  );
}

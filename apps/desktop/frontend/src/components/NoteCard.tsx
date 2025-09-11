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

type Props = {
  item: NoteListItem;
  onOpen: (id: string) => void;
  isSelected?: boolean;
};

export function NoteCard({ item, onOpen, isSelected }: Props) {
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (hours < 1) return "Just now";
    if (hours < 24) return `${hours}h ago`;
    if (days === 1) return "Yesterday";
    if (days < 7) return `${days}d ago`;
    if (days < 30) return `${Math.floor(days / 7)}w ago`;
    return date.toLocaleDateString();
  };

  return (
    <div 
      className={`note-card ${isSelected ? "note-card-selected" : ""}`}
      onClick={() => onOpen(item.id)}
    >
      {item.preview_path ? (
        <img 
          className="note-thumbnail" 
          src={`http://127.0.0.1:3030/file/${item.preview_path}`} 
          alt="" 
        />
      ) : (
        <div className="note-thumbnail">
          📄
        </div>
      )}
      
      <div className="note-title">
        {item.title || "Untitled Note"}
      </div>
      
      <div className="note-meta">
        <span>{formatDate(item.created_at)}</span>
        {item.source_url && <span>• From web</span>}
      </div>
      
      {item.snippet && (
        <div className="note-snippet">
          {item.snippet}
        </div>
      )}
      
      {item.tags?.length > 0 && (
        <div className="note-tags">
          {item.tags.map(tag => (
            <span key={tag} className="tag tag-accent">
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

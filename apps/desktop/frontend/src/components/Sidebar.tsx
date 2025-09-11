import React, { useState } from "react";
import { Note } from "../App";

type Props = {
  notes: Note[];
  activeNoteId: string | null;
  onSelectNote: (id: string) => void;
  onCreateNote: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
};

export default function Sidebar({ 
  notes, 
  activeNoteId, 
  onSelectNote, 
  onCreateNote,
  collapsed,
  onToggleCollapse 
}: Props) {
  const [searchQuery, setSearchQuery] = useState("");
  
  const filteredNotes = notes.filter(note => 
    note.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    note.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()))
  );

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
    return date.toLocaleDateString();
  };

  return (
    <aside className={`sidebar ${collapsed ? "collapsed" : ""}`}>
      <div className="sidebar-header">
        {!collapsed && (
          <div className="sidebar-title">
            <span>📚</span>
            <span>My Notes</span>
          </div>
        )}
        <button 
          className="btn-icon"
          onClick={onToggleCollapse}
          title={collapsed ? "Expand" : "Collapse"}
        >
          {collapsed ? "→" : "←"}
        </button>
      </div>

      {!collapsed && (
        <>
          <div className="sidebar-search">
            <input
              type="text"
              placeholder="Search notes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="sidebar-search-input"
            />
          </div>

          <div className="sidebar-actions">
            <button 
              className="btn-new-note"
              onClick={onCreateNote}
            >
              <span>➕</span>
              <span>New Note</span>
            </button>
          </div>
        </>
      )}

      <div className="sidebar-content">
        {collapsed ? (
          <div className="collapsed-notes">
            {filteredNotes.map(note => (
              <button
                key={note.id}
                className={`collapsed-note-item ${activeNoteId === note.id ? "active" : ""}`}
                onClick={() => onSelectNote(note.id)}
                title={note.title}
              >
                📄
              </button>
            ))}
          </div>
        ) : (
          <div className="note-list">
            {filteredNotes.length === 0 ? (
              <div className="no-notes">
                <p>No notes found</p>
              </div>
            ) : (
              filteredNotes.map(note => (
                <div
                  key={note.id}
                  className={`note-list-item ${activeNoteId === note.id ? "active" : ""}`}
                  onClick={() => onSelectNote(note.id)}
                >
                  <div className="note-list-title">{note.title}</div>
                  <div className="note-list-meta">
                    <span className="note-list-date">{formatDate(note.created_at)}</span>
                    {note.tags.length > 0 && (
                      <div className="note-list-tags">
                        {note.tags.slice(0, 2).map(tag => (
                          <span key={tag} className="mini-tag">{tag}</span>
                        ))}
                        {note.tags.length > 2 && (
                          <span className="mini-tag">+{note.tags.length - 2}</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

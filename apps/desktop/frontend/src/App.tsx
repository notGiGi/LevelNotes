import React, { useState, useEffect, useRef } from "react";
import Workspace from "./components/Workspace";
import Sidebar from "./components/Sidebar";
import "./app.css";

const API = "http://127.0.0.1:3030";

export type Note = {
  id: string;
  title: string;
  created_at: string;
  content: any;
  tags: string[];
  preview_path?: string | null;
};

export default function App() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchNotes();
  }, []);

  const fetchNotes = async () => {
    try {
      const res = await fetch(`${API}/search?q=`);
      const data = await res.json();
      setNotes(data);
      if (data.length > 0 && !activeNoteId) {
        setActiveNoteId(data[0].id);
      }
    } catch (e) {
      console.error("Failed to fetch notes:", e);
    } finally {
      setLoading(false);
    }
  };

  const createNote = async () => {
    try {
      const payload = {
        source: { kind: "web", url: "" },
        selection: { 
          text: "New Study Note", 
          html: "<h1>New Study Note</h1><p>Start taking notes...</p>" 
        },
        ops: { tags: ["study"] }
      };
      
      const res = await fetch(`${API}/clip`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      
      const data = await res.json();
      await fetchNotes();
      setActiveNoteId(data.note_id);
    } catch (e) {
      console.error("Failed to create note:", e);
    }
  };

  const activeNote = notes.find(n => n.id === activeNoteId);

  return (
    <div className="app-container">
      <Sidebar
        notes={notes}
        activeNoteId={activeNoteId}
        onSelectNote={setActiveNoteId}
        onCreateNote={createNote}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
      />
      
      <main className="main-content">
        {activeNote ? (
          <Workspace
            note={activeNote}
            onUpdate={fetchNotes}
          />
        ) : (
          <div className="empty-workspace">
            <div className="empty-icon">📚</div>
            <h2>Welcome to LevelNotes</h2>
            <p>Select a note from the sidebar or create a new one to get started</p>
            <button className="btn-primary" onClick={createNote}>
              Create Your First Note
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

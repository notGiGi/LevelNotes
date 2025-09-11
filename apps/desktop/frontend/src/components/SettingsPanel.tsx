import React, { useState } from "react";

type Props = {
  theme: string;
  onThemeChange: (theme: string) => void;
  focusMode: boolean;
  onFocusModeChange: (enabled: boolean) => void;
};

export default function SettingsPanel({ theme, onThemeChange, focusMode, onFocusModeChange }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [fontSize, setFontSize] = useState(localStorage.getItem("fontSize") || "medium");

  const themes = [
    { id: "light", name: "Light", icon: "☀️" },
    { id: "dark", name: "Dark", icon: "🌙" },
    { id: "sepia", name: "Sepia", icon: "📜" }
  ];

  const fontSizes = [
    { id: "small", name: "Small", size: "14px" },
    { id: "medium", name: "Medium", size: "16px" },
    { id: "large", name: "Large", size: "18px" }
  ];

  const handleFontSizeChange = (size: string) => {
    setFontSize(size);
    localStorage.setItem("fontSize", size);
    const sizeMap: any = { small: "14px", medium: "16px", large: "18px" };
    document.documentElement.style.setProperty("font-size", sizeMap[size]);
  };

  return (
    <div className="settings-panel">
      {isOpen && (
        <div className="settings-menu">
          <div className="settings-item">
            <label className="settings-label">Theme</label>
            <div className="theme-selector">
              {themes.map(t => (
                <button
                  key={t.id}
                  className={`theme-option ${theme === t.id ? "active" : ""}`}
                  onClick={() => onThemeChange(t.id)}
                >
                  <div style={{ fontSize: 20, marginBottom: 4 }}>{t.icon}</div>
                  <div>{t.name}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="settings-item">
            <label className="settings-label">Font Size</label>
            <div className="theme-selector">
              {fontSizes.map(f => (
                <button
                  key={f.id}
                  className={`theme-option ${fontSize === f.id ? "active" : ""}`}
                  onClick={() => handleFontSizeChange(f.id)}
                >
                  <div style={{ fontSize: f.size }}>Aa</div>
                  <div style={{ fontSize: 11 }}>{f.name}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="settings-item">
            <label className="settings-label">Focus Mode</label>
            <button
              className={`btn ${focusMode ? "btn-primary" : ""}`}
              onClick={() => onFocusModeChange(!focusMode)}
              style={{ width: "100%" }}
            >
              {focusMode ? "🎯 Enabled" : "👁️ Disabled"}
            </button>
          </div>

          <div className="settings-item">
            <label className="settings-label">Keyboard Shortcuts</label>
            <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6 }}>
              <div>⌘/Ctrl + K - Search</div>
              <div>⌘/Ctrl + N - New Note</div>
              <div>⌘/Ctrl + E - Export</div>
              <div>Esc - Close Modal</div>
            </div>
          </div>
        </div>
      )}
      
      <button 
        className="settings-toggle"
        onClick={() => setIsOpen(!isOpen)}
      >
        {isOpen ? "✕" : "⚙️"}
      </button>
    </div>
  );
}

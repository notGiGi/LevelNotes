const API = "http://127.0.0.1:3030/clip";

function selectionHtml(): string {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return "";
  const range = sel.getRangeAt(0).cloneContents();
  const div = document.createElement("div");
  div.appendChild(range);
  return div.innerHTML;
}

async function send() {
  const text = window.getSelection()?.toString() || document.title || location.href;
  const html = selectionHtml();
  const payload = {
    source: { kind: "web", url: location.href },
    selection: { text, html },
    ops: { summarize: false, tags: [] }
  };
  try {
    await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    console.log("LevelNotes: clip sent.");
  } catch (e) {
    console.warn("LevelNotes: backend not reachable.", e);
  }
}

document.addEventListener("keydown", (ev) => {
  if (ev.altKey && (ev.key === "l" || ev.key === "L")) {
    ev.preventDefault();
    send();
  }
}, { capture: true });

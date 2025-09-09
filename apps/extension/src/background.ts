const API = "http://127.0.0.1:3030/clip";

function getSelectionScript() {
  return () => {
    function selectionHtml() {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return "";
      const range = sel.getRangeAt(0).cloneContents();
      const div = document.createElement("div");
      div.appendChild(range);
      return div.innerHTML;
    }
    const sel = window.getSelection();
    const text = sel ? sel.toString() : "";
    const html = selectionHtml();
    return { text, html, url: location.href, title: document.title };
  };
}

async function clipFromActiveTab(tabId?: number) {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id) return;
  const [res] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: getSelectionScript()
  });
  const data = res?.result || { text: "", html: "", url: tab.url || "", title: tab.title || "" };
  const payload = {
    source: { kind: "web", url: data.url },
    selection: { text: data.text || data.title || data.url, html: data.html || "" },
    ops: { summarize: false, tags: [] }
  };
  try {
    const r = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!r.ok) throw new Error("HTTP " + r.status);
    // feedback simple en badge
    if (tab.id) {
      await chrome.action.setBadgeText({ tabId: tab.id, text: "✓" });
      setTimeout(() => chrome.action.setBadgeText({ tabId: tab.id!, text: "" }), 1200);
    }
  } catch (e) {
    if (tab.id) {
      await chrome.action.setBadgeText({ tabId: tab.id, text: "×" });
      setTimeout(() => chrome.action.setBadgeText({ tabId: tab.id!, text: "" }), 1500);
    }
    console.warn("LevelNotes clip failed:", e);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "levelnotes-clip",
    title: "Send selection to LevelNotes",
    contexts: ["selection", "page"]
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "levelnotes-clip") {
    clipFromActiveTab(tab?.id);
  }
});

chrome.commands.onCommand.addListener((cmd) => {
  if (cmd === "send-selection") clipFromActiveTab();
});

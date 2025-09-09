import type { ClipPayload } from "@levelnotes/core";

export async function sendClipToDesktop(payload: ClipPayload) {
  const res = await fetch("http://127.0.0.1:3030/clip", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error(`Desktop refused: ${res.status}`);
  return res.json();
}

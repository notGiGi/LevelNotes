export type SourceKind = "web" | "pdf" | "image";

export interface TextQuoteSelector {
  exact: string;
  prefix?: string;
  suffix?: string;
}

export interface ClipPayload {
  source: {
    kind: SourceKind;
    url?: string;
    doi?: string;
    metadata?: Record<string, unknown>;
  };
  selection?: {
    text?: string;
    html?: string;
    anchors?: {
      xpath?: string;
      startOffset?: number;
      endOffset?: number;
      textQuote?: TextQuoteSelector;
    };
  };
  media?: { screenshotDataUrl?: string };
  ops?: { summarize?: boolean; tags?: string[] };
}

export interface NoteRecord {
  id: string;
  created_at: string; // ISO
  title: string;
  plaintext?: string;
  html?: string;
  source_url?: string;
  text_quote?: string;
  preview_path?: string;
  tags_json?: string; // JSON array
}

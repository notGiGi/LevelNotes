#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{fs, net::SocketAddr, path::{Path as FsPath, PathBuf, Component}, sync::{Arc, Mutex}};
use axum::{extract::{Path as AxPath, Query as AxQuery, Json as AxJson}, http::{HeaderMap, header, StatusCode}, routing::{get, post}, Json, Router};
use chrono::Utc;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use tokio::net::TcpListener;
use tower_http::cors::{Any, CorsLayer};
use uuid::Uuid;
use base64::{engine::general_purpose, Engine as _};

#[derive(Deserialize)]
struct ClipPayload { source: Option<Source>, selection: Option<Selection>, media: Option<Media>, ops: Option<Ops> }
#[derive(Deserialize)] struct Source { kind: String, url: Option<String>, doi: Option<String> }
#[derive(Deserialize)] struct Selection { text: Option<String>, html: Option<String> }
#[derive(Deserialize)] struct Media { screenshotDataUrl: Option<String> }
#[derive(Deserialize, Serialize, Clone)] struct Rect { x: f32, y: f32, w: f32, h: f32 }
#[derive(Deserialize)] struct Ops { summarize: Option<bool>, tags: Option<Vec<String>>, page: Option<i32>, highlights: Option<Vec<Rect>> }
#[derive(Deserialize)] struct UpdatePayload { title: Option<String>, tags: Option<Vec<String>> }

#[derive(Serialize)] struct ClipResponse { ok: bool, note_id: String }
#[derive(Serialize)] struct OkResponse { ok: bool }

#[derive(Serialize)]
struct NoteListItem { id: String, title: String, created_at: String, source_url: Option<String>, tags: Vec<String>, snippet: Option<String>, preview_path: Option<String> }

#[derive(Serialize)]
struct NoteDetail {
  id: String, created_at: String, title: String,
  plaintext: Option<String>, html: Option<String>,
  source_url: Option<String>, text_quote: Option<String>,
  tags: Vec<String>, preview_path: Option<String>,
  page_number: Option<i32>, highlights: Vec<Rect>,
}

#[derive(Deserialize)] struct SearchParams { q: Option<String> }

#[derive(Clone)] struct AppState { db: Arc<Mutex<Connection>>, data_dir: PathBuf }

fn init_db_at(path: &FsPath) -> Connection {
  if let Some(parent) = path.parent() { std::fs::create_dir_all(parent).expect("create db dir"); }
  let db = Connection::open(path).expect("db open");
  db.execute_batch(r#"
    PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      title TEXT NOT NULL,
      plaintext TEXT, html TEXT, source_url TEXT, text_quote TEXT,
      preview_path TEXT, tags_json TEXT, page_number INTEGER, highlights_json TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_notes_created_at ON notes(created_at DESC);

    CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts
    USING fts5(title, plaintext, html, tags, content='notes', content_rowid='rowid');

    CREATE TRIGGER IF NOT EXISTS notes_ai AFTER INSERT ON notes BEGIN
      INSERT INTO notes_fts(rowid, title, plaintext, html, tags)
      VALUES (new.rowid, new.title, new.plaintext, new.html,
        (SELECT COALESCE(group_concat(value, ' '), '') FROM json_each(new.tags_json)));
    END;
    CREATE TRIGGER IF NOT EXISTS notes_ad AFTER DELETE ON notes BEGIN
      INSERT INTO notes_fts(notes_fts, rowid) VALUES ('delete', old.rowid);
    END;
    CREATE TRIGGER IF NOT EXISTS notes_au AFTER UPDATE ON notes BEGIN
      INSERT INTO notes_fts(notes_fts, rowid) VALUES ('delete', old.rowid);
      INSERT INTO notes_fts(rowid, title, plaintext, html, tags)
      VALUES (new.rowid, new.title, new.plaintext, new.html,
        (SELECT COALESCE(group_concat(value, ' '), '') FROM json_each(new.tags_json)));
    END;
  "#).expect("migrate");
  db
}

fn resolve_db_path() -> PathBuf {
  if let Ok(local) = std::env::var("LOCALAPPDATA") {
    PathBuf::from(local).join("LevelNotes").join("levelnotes.db")
  } else {
    PathBuf::from("../.levelnotes/levelnotes.db")
  }
}

fn sanitize_filename(s: &str) -> String {
  let mut out = String::with_capacity(s.len());
  for ch in s.chars().take(60) {
    if ch.is_ascii_alphanumeric() || ch=='-'||ch=='_'||ch==' ' { out.push(ch); } else { out.push('-'); }
  }
  let t = out.trim();
  if t.is_empty() { "note".into() } else { t.into() }
}

fn save_data_url_png(data_url: &str, id: &str, data_dir: &FsPath) -> Option<String> {
  let comma = data_url.find(',')?;
  let (_header, b64) = data_url.split_at(comma + 1);
  let bytes = general_purpose::STANDARD.decode(b64).ok()?;
  let dir = data_dir.join("previews"); let _ = fs::create_dir_all(&dir);
  let rel = format!("previews/{}.png", id); let abs = data_dir.join(&rel);
  fs::write(abs, bytes).ok()?; Some(rel)
}

fn merge_tags(old_json: Option<String>, add: &[String]) -> String {
  let mut set: std::collections::BTreeSet<String> = old_json
    .and_then(|j| serde_json::from_str::<Vec<String>>(&j).ok())
    .unwrap_or_default().into_iter().collect();
  for t in add { let t=t.trim(); if !t.is_empty() { set.insert(t.to_string()); } }
  serde_json::to_string::<Vec<String>>(&set.into_iter().collect()).unwrap()
}

fn build_router(state: AppState) -> Router {
  let cors = CorsLayer::new().allow_origin(Any).allow_methods(Any).allow_headers(Any);
  let data_dir_for_files = state.data_dir.clone();

  Router::new()
    .route("/health", get(|| async { "ok" }))

    .route("/file/*path", get({
      let data_dir = data_dir_for_files.clone();
      move |axum::extract::Path(path): axum::extract::Path<String>| async move {
        let rel = PathBuf::from(&path);
        for c in rel.components() {
          match c { Component::ParentDir|Component::RootDir|Component::Prefix(_) =>
            return (StatusCode::BAD_REQUEST, HeaderMap::new(), Vec::<u8>::new()),
            _=>{}
          }
        }
        let abs = data_dir.join(rel);
        match fs::read(&abs) {
          Ok(bytes) => {
            let mut headers = HeaderMap::new();
            let ct = if abs.extension().and_then(|e| e.to_str())==Some("png"){"image/png"}else{"application/octet-stream"};
            headers.insert(header::CONTENT_TYPE, ct.parse().unwrap());
            (StatusCode::OK, headers, bytes)
          }
          Err(_) => (StatusCode::NOT_FOUND, HeaderMap::new(), Vec::<u8>::new())
        }
      }
    }))

    // create new
    .route("/clip", post({
      let state = state.clone();
      move |AxJson(payload): AxJson<ClipPayload>| async move {
        let id = Uuid::new_v4().to_string();
        let created_at = Utc::now().to_rfc3339();
        let title = payload.selection.as_ref()
          .and_then(|s| s.text.as_ref()).map(|t| t.trim()).filter(|s| !s.is_empty())
          .map(|t| t.chars().take(80).collect::<String>())
          .unwrap_or_else(|| "Untitled clip".to_string());
        let plaintext = payload.selection.as_ref().and_then(|s| s.text.clone());
        let html = payload.selection.as_ref().and_then(|s| s.html.clone());
        let source_url = payload.source.as_ref().and_then(|s| s.url.clone());
        let text_quote = plaintext.clone();
        let tags_vec: Vec<String> = payload.ops.as_ref().and_then(|o| o.tags.clone()).unwrap_or_default();
        let tags_json = serde_json::to_string(&tags_vec).unwrap();
        let page_number: Option<i32> = payload.ops.as_ref().and_then(|o| o.page);
        let highlights_json: String = payload.ops.as_ref()
          .and_then(|o| o.highlights.clone())
          .map(|v| serde_json::to_string(&v).unwrap()).unwrap_or_else(|| "[]".to_string());

        let preview_rel: Option<String> = if let Some(m)=&payload.media {
          if let Some(data_url)=&m.screenshotDataUrl { let data_dir=state.data_dir.clone(); save_data_url_png(data_url,&id,&data_dir) } else { None }
        } else { None };

        { let db = state.db.lock().expect("db");
          db.execute(
            "INSERT INTO notes (id, created_at, title, plaintext, html, source_url, text_quote, preview_path, tags_json, page_number, highlights_json)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)",
            params![id,created_at,title,plaintext,html,source_url,text_quote,preview_rel,tags_json,page_number,highlights_json]
          ).expect("insert");
        }
        println!("Saved clip: {} (source={:?}, tags={:?}, page={:?})", id, source_url, tags_vec, page_number);
        Json(ClipResponse{ok:true,note_id:id})
      }
    }))

    // append to existing
    .route("/append/:id", post({
      let state = state.clone();
      move |AxPath(id): AxPath<String>, AxJson(payload): AxJson<ClipPayload>| async move {
        let (old_pt, old_html, old_tags_json, old_preview): (Option<String>, Option<String>, Option<String>, Option<String>) = {
          let db = state.db.lock().expect("db");
          let mut stmt = db.prepare("SELECT plaintext, html, tags_json, preview_path FROM notes WHERE id=?1").expect("prep");
          let mut cur = stmt.query(params![id]).expect("q");
          if let Some(row)=cur.next().expect("next") { (row.get(0).ok(),row.get(1).ok(),row.get(2).ok(),row.get(3).ok()) } else {
            return (StatusCode::NOT_FOUND, Json(OkResponse{ok:false}));
          }
        };
        let add_text = payload.selection.as_ref().and_then(|s| s.text.clone()).unwrap_or_default();
        let add_html = payload.selection.as_ref().and_then(|s| s.html.clone()).unwrap_or_default();
        let new_pt = if let Some(prev)=old_pt { if !add_text.is_empty() && !prev.is_empty() { format!("{}\n\n{}", prev, add_text) } else if prev.is_empty(){ add_text } else { prev } } else { add_text };
        let new_html = if let Some(prev)=old_html { if !add_html.is_empty() && !prev.is_empty() { format!("{}\n\n{}", prev, add_html) } else if prev.is_empty(){ add_html } else { prev } } else { add_html };
        let add_tags: Vec<String> = payload.ops.as_ref().and_then(|o| o.tags.clone()).unwrap_or_default();
        let tags_json = merge_tags(old_tags_json, &add_tags);
        let preview_rel: Option<String> = if old_preview.is_none() {
          if let Some(m)=&payload.media { if let Some(data_url)=&m.screenshotDataUrl { let data_dir=state.data_dir.clone(); save_data_url_png(data_url, &id, &data_dir) } else { None } } else { None }
        } else { old_preview };

        { let db = state.db.lock().expect("db");
          db.execute("UPDATE notes SET plaintext=?1, html=?2, tags_json=?3, preview_path=COALESCE(preview_path, ?4) WHERE id=?5",
            params![new_pt, new_html, tags_json, preview_rel, id]).expect("update");
        }
        println!("Appended clip into note {}", id);
        (StatusCode::OK, Json(OkResponse{ok:true}))
      }
    }))

    // update (title/tags)
    .route("/update/:id", post({
      let state = state.clone();
      move |AxPath(id): AxPath<String>, AxJson(payload): AxJson<UpdatePayload>| async move {
        let (old_tags_json,): (Option<String>,) = {
          let db = state.db.lock().expect("db");
          let mut s=db.prepare("SELECT tags_json FROM notes WHERE id=?1").expect("prep");
          let mut c=s.query(params![id]).expect("q");
          if let Some(r)=c.next().expect("n") { (r.get(0).ok(),) } else { (None,) }
        };
        let merged = match payload.tags { Some(v)=> merge_tags(old_tags_json, &v), None=> old_tags_json.unwrap_or_else(|| "[]".to_string()) };
        {
          let db = state.db.lock().expect("db");
          db.execute("UPDATE notes SET title=COALESCE(?1,title), tags_json=?2 WHERE id=?3",
            params![payload.title, merged, id]).expect("upd");
        }
        Json(OkResponse{ok:true})
      }
    }))

    .route("/notes", get({
      let state = state.clone();
      move || async move {
        let rows: Vec<NoteListItem> = {
          let db = state.db.lock().expect("db");
          let mut stmt = db.prepare(
            "SELECT id, title, created_at, source_url, tags_json, plaintext, preview_path
             FROM notes ORDER BY created_at DESC LIMIT 200").expect("prep");
          let mut cur=stmt.query([]).expect("q");
          let mut out=Vec::new();
          while let Some(row)=cur.next().expect("n") {
            let id: String = row.get(0).unwrap();
            let title: String = row.get(1).unwrap_or_else(|_| "Untitled clip".to_string());
            let created_at: String = row.get(2).unwrap();
            let source_url: Option<String> = row.get(3).unwrap_or(None);
            let tags_json: Option<String> = row.get(4).unwrap_or(None);
            let plaintext: Option<String> = row.get(5).unwrap_or(None);
            let preview_path: Option<String> = row.get(6).unwrap_or(None);
            let tags: Vec<String> = tags_json.and_then(|j| serde_json::from_str::<Vec<String>>(&j).ok()).unwrap_or_default();
            let snippet = plaintext.as_ref().map(|s| { let s=s.trim(); let mut out=s.chars().take(160).collect::<String>(); if s.len()>out.len(){out.push_str("…");} out });
            out.push(NoteListItem{ id, title, created_at, source_url, tags, snippet, preview_path });
          }
          out
        };
        Json(rows)
      }
    }))

    .route("/search", get({
      let state = state.clone();
      move |AxQuery(params): AxQuery<SearchParams>| async move {
        let q = params.q.unwrap_or_default();
        let rows: Vec<NoteListItem> = {
          let db = state.db.lock().expect("db");
          if q.trim().is_empty() {
            let mut stmt = db.prepare("SELECT id,title,created_at,source_url,tags_json,plaintext,preview_path FROM notes ORDER BY created_at DESC LIMIT 100").expect("p");
            let mut cur=stmt.query([]).expect("q");
            let mut out=Vec::new();
            while let Some(row)=cur.next().expect("n") {
              let id:String=row.get(0).unwrap(); let title:String=row.get(1).unwrap_or_else(|_|"Untitled clip".into());
              let created_at:String=row.get(2).unwrap(); let source_url:Option<String>=row.get(3).unwrap_or(None);
              let tags_json:Option<String>=row.get(4).unwrap_or(None); let plaintext:Option<String>=row.get(5).unwrap_or(None);
              let preview_path:Option<String>=row.get(6).unwrap_or(None);
              let tags:Vec<String>=tags_json.and_then(|j|serde_json::from_str::<Vec<String>>(&j).ok()).unwrap_or_default();
              let snippet=plaintext.as_ref().map(|s|{let s=s.trim(); let mut out=s.chars().take(160).collect::<String>(); if s.len()>out.len(){out.push_str("…");} out});
              out.push(NoteListItem{ id,title,created_at,source_url,tags,snippet,preview_path});
            } out
          } else {
            let mut stmt = db.prepare(
              "SELECT n.id,n.title,n.created_at,n.source_url,n.tags_json,n.plaintext,n.preview_path
               FROM notes n JOIN notes_fts f ON f.rowid=n.rowid
               WHERE notes_fts MATCH ?1 ORDER BY n.created_at DESC LIMIT 100").expect("p");
            let mut cur=stmt.query([q]).expect("q");
            let mut out=Vec::new();
            while let Some(row)=cur.next().expect("n") {
              let id:String=row.get(0).unwrap(); let title:String=row.get(1).unwrap_or_else(|_|"Untitled clip".into());
              let created_at:String=row.get(2).unwrap(); let source_url:Option<String>=row.get(3).unwrap_or(None);
              let tags_json:Option<String>=row.get(4).unwrap_or(None); let plaintext:Option<String>=row.get(5).unwrap_or(None);
              let preview_path:Option<String>=row.get(6).unwrap_or(None);
              let tags:Vec<String>=tags_json.and_then(|j|serde_json::from_str::<Vec<String>>(&j).ok()).unwrap_or_default();
              let snippet=plaintext.as_ref().map(|s|{let s=s.trim(); let mut out=s.chars().take(160).collect::<String>(); if s.len()>out.len(){out.push_str("…");} out});
              out.push(NoteListItem{ id,title,created_at,source_url,tags,snippet,preview_path});
            } out
          }
        };
        Json(rows)
      }
    }))

    .route("/note/:id", get({
      let state = state.clone();
      move |AxPath(id): AxPath<String>| async move {
        let res: Option<NoteDetail> = {
          let db = state.db.lock().expect("db");
          let mut stmt = db.prepare(
            "SELECT id,created_at,title,plaintext,html,source_url,text_quote,preview_path,tags_json,page_number,highlights_json
             FROM notes WHERE id=?1").expect("p");
          let mut cur=stmt.query(params![id]).expect("q");
          if let Some(row)=cur.next().expect("n") {
            let id:String=row.get(0).unwrap(); let created_at:String=row.get(1).unwrap();
            let title:String=row.get(2).unwrap_or_else(|_|"Untitled clip".into());
            let plaintext:Option<String>=row.get(3).unwrap_or(None); let html:Option<String>=row.get(4).unwrap_or(None);
            let source_url:Option<String>=row.get(5).unwrap_or(None); let text_quote:Option<String>=row.get(6).unwrap_or(None);
            let preview_path:Option<String>=row.get(7).unwrap_or(None); let tags_json:Option<String>=row.get(8).unwrap_or(None);
            let page_number:Option<i32>=row.get(9).unwrap_or(None); let highlights_json:Option<String>=row.get(10).unwrap_or(None);
            let tags:Vec<String>=tags_json.and_then(|j|serde_json::from_str::<Vec<String>>(&j).ok()).unwrap_or_default();
            let highlights:Vec<Rect>=highlights_json.and_then(|j|serde_json::from_str::<Vec<Rect>>(&j).ok()).unwrap_or_default();
            Some(NoteDetail{ id,created_at,title,plaintext,html,source_url,text_quote,tags,preview_path,page_number,highlights })
          } else { None }
        };
        match res { Some(note)=>Json(note), None=>Json(NoteDetail{
          id:"not-found".into(), created_at:"".into(), title:"Not found".into(),
          plaintext:None, html:None, source_url:None, text_quote:None, tags:vec![], preview_path:None, page_number:None, highlights:vec![]
        })}
      }
    }))

    .route("/delete/:id", post({
      let state = state.clone();
      move |AxPath(id): AxPath<String>| async move {
        let affected = { let db=state.db.lock().expect("db"); db.execute("DELETE FROM notes WHERE id=?1", params![id]).expect("del") };
        println!("Deleted note {} (affected={})", id, affected);
        Json(OkResponse{ok:true})
      }
    }))

    .route("/export/:id.md", get({
      let state = state.clone();
      move |AxPath(id): AxPath<String>| async move {
        let (title, created_at, plaintext, html, source_url, tags_json):(String,String,Option<String>,Option<String>,Option<String>,Option<String>) = {
          let db=state.db.lock().expect("db");
          let mut s=db.prepare("SELECT title,created_at,plaintext,html,source_url,tags_json FROM notes WHERE id=?1").expect("p");
          let mut c=s.query(params![id]).expect("q");
          if let Some(r)=c.next().expect("n") {
            (r.get(0).unwrap_or_else(|_|"Untitled clip".into()),
             r.get(1).unwrap_or_default(),
             r.get(2).unwrap_or(None), r.get(3).unwrap_or(None), r.get(4).unwrap_or(None), r.get(5).unwrap_or(None))
          } else { ("Not found".into(),"".into(),None,None,None,None) }
        };
        let tags:Vec<String>=tags_json.and_then(|j|serde_json::from_str::<Vec<String>>(&j).ok()).unwrap_or_default();
        let mut md=String::new();
        md.push_str(&format!("# {}\n\n", title));
        md.push_str(&format!("- **Created:** {}\n", created_at));
        if let Some(u)=&source_url { md.push_str(&format!("- **Source:** {}\n", u)); }
        if !tags.is_empty(){ md.push_str("- **Tags:** "); md.push_str(&tags.iter().map(|t|format!("#{}",t)).collect::<Vec<_>>().join(" ")); md.push('\n'); }
        md.push('\n');
        if let Some(pt)=&plaintext { md.push_str("## Clip (plaintext)\n\n"); md.push_str(pt); md.push_str("\n\n"); }
        if let Some(h)=&html { md.push_str("## Clip (HTML)\n\n```html\n"); md.push_str(h); md.push_str("\n```\n"); }
        let mut headers=HeaderMap::new();
        headers.insert(header::CONTENT_TYPE, "text/markdown; charset=utf-8".parse().unwrap());
        let safe=sanitize_filename(&title);
        headers.insert(header::CONTENT_DISPOSITION, format!("attachment; filename=\"{}-{}.md\"", safe, id).parse().unwrap());
        (headers, md)
      }
    }))
    .layer(cors)
}

fn main() {
  let db_path = resolve_db_path();
  println!("LevelNotes DB  {}", db_path.display());
  let data_dir = db_path.parent().map(|p| p.to_path_buf()).unwrap_or_else(|| PathBuf::from("."));
  let state = AppState { db: Arc::new(Mutex::new(init_db_at(&db_path))), data_dir };
  let router = build_router(state);
  let addr: SocketAddr = "127.0.0.1:3030".parse().unwrap();

  tauri::Builder::default()
    .setup(move |_| {
      tauri::async_runtime::spawn(async move {
        println!("LevelNotes HTTP listening on http://{}", addr);
        let listener = TcpListener::bind(addr).await.expect("bind tcp");
        axum::serve(listener, router).await.expect("serve axum");
      });
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error running tauri app");
}

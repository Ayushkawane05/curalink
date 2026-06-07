/**
 * App.jsx — Curalink v2 React UI
 *
 * Features implemented:
 *  Phase 2 — 2-panel layout (sidebar + main), ReactMarkdown rendering
 *  Phase 3 — Session memory: create / load / delete sessions, history in sidebar
 *  Phase 4 — PDF/TXT upload drop-zone in sidebar
 *  Phase 5 — Anti-hallucination validation badges on every source card
 *  Quality  — Streaming chat bubbles, auto-resize textarea, auto-scroll,
 *             welcome screen with example prompts, mobile sidebar toggle
 */

import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const API = "/api";

// ─── Utilities ────────────────────────────────────────────────────────────────

function formatTime(date) {
  if (!date) return "";
  return new Date(date).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Validation Banner ────────────────────────────────────────────────────────
function ValidationBanner({ validation }) {
  if (!validation) return null;
  const { valid = [], invalid = [], uncited = [] } = validation;

  if (invalid.length > 0) {
    return (
      <div className="validation-banner validation-error">
        🚫 <strong>{invalid.length} PMID(s) cited but not in retrieved sources</strong>
        {" "}— possible hallucination detected (PMIDs: {invalid.join(", ")})
      </div>
    );
  }
  if (valid.length > 0 && uncited.length > 0) {
    return (
      <div className="validation-banner validation-warn">
        ⚠️ <strong>{valid.length} citation(s) verified.</strong>
        {" "}{uncited.length} retrieved source(s) not referenced in answer.
      </div>
    );
  }
  if (valid.length > 0) {
    return (
      <div className="validation-banner validation-ok">
        ✅ All {valid.length} citation(s) verified against retrieved sources
      </div>
    );
  }
  return (
    <div className="validation-banner validation-warn">
      ℹ️ No PMID citations found in this answer
    </div>
  );
}

// ─── Source Card ──────────────────────────────────────────────────────────────
function SourceCard({ source, index, validation }) {
  const [expanded, setExpanded] = useState(false);

  const isValid   = validation?.valid?.includes(source.pmid);
  const isInvalid = validation?.invalid?.includes(source.pmid);
  const isUncited = validation?.uncited?.includes(source.pmid);

  const badge = isInvalid
    ? { cls: "badge-error", label: "🚫 Hallucinated" }
    : isValid
    ? { cls: "badge-ok",    label: "✅ Cited" }
    : isUncited
    ? { cls: "badge-warn",  label: "⚠️ Not cited" }
    : { cls: "badge-neutral", label: "— Pending" };

  const similarityPct = Math.round((source.score || 0) * 100);

  return (
    <div className={`source-card${expanded ? " expanded" : ""}`}>
      <div
        className="source-card-header"
        onClick={() => setExpanded((e) => !e)}
        role="button"
        aria-expanded={expanded}
      >
        <div className="source-card-left">
          <span className="source-index">{index + 1}</span>
          <div className="source-card-meta">
            <span className="source-card-title">{source.title}</span>
            <div className="source-card-row">
              {source.source === "upload" ? (
                <span className="source-type-badge">📄 Uploaded Doc</span>
              ) : (
                <a
                  className="source-pmid-link"
                  href={`https://pubmed.ncbi.nlm.nih.gov/${source.pmid}/`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                >
                  PMID: {source.pmid} ↗
                </a>
              )}
              <span className={`validation-badge ${badge.cls}`}>{badge.label}</span>
            </div>
          </div>
        </div>
        <div className="source-card-right">
          <div className="similarity-bar" title={`Similarity: ${similarityPct}%`}>
            <div className="similarity-fill" style={{ width: `${similarityPct}%` }} />
          </div>
          <span className="similarity-pct">{similarityPct}%</span>
          <span className="expand-icon">{expanded ? "▲" : "▼"}</span>
        </div>
      </div>

      {expanded && source.snippet && (
        <div className="source-snippet">
          <p>
            {source.snippet}
            {source.snippet.length >= 350 ? "…" : ""}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Message Bubble ───────────────────────────────────────────────────────────
function MessageBubble({ msg }) {
  const [showSources, setShowSources] = useState(false);
  const isStreaming = msg.streaming === true;

  if (msg.role === "user") {
    return (
      <div className="msg-row msg-user">
        <div className="msg-bubble user-bubble">
          <p>{msg.content}</p>
          <span className="msg-time">{formatTime(msg.createdAt)}</span>
        </div>
      </div>
    );
  }

  // Assistant
  return (
    <div className="msg-row msg-assistant">
      <div className="assistant-avatar" aria-label="Curalink AI">🧬</div>
      <div className="msg-assistant-content">
        <div className="msg-bubble assistant-bubble">
          {isStreaming && !msg.content ? (
            <div className="thinking-indicator">
              <span className="thinking-dot" />
              <span className="thinking-dot" />
              <span className="thinking-dot" />
              <span className="thinking-text">Searching research papers…</span>
            </div>
          ) : (
            <div className="markdown-content">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {msg.content || ""}
              </ReactMarkdown>
            </div>
          )}
          {!isStreaming && (
            <span className="msg-time">{formatTime(msg.createdAt)}</span>
          )}
        </div>

        {/* Validation banner — shown once streaming is done */}
        {!isStreaming && msg.validation && (
          <ValidationBanner validation={msg.validation} />
        )}

        {/* Sources panel */}
        {msg.sources && msg.sources.length > 0 && (
          <div className="sources-panel">
            <button
              className="sources-toggle"
              onClick={() => setShowSources((s) => !s)}
              aria-expanded={showSources}
            >
              <span>📚 Sources ({msg.sources.length})</span>
              <span>{showSources ? "▲ Hide" : "▼ Show"}</span>
            </button>

            {showSources && (
              <div className="sources-list">
                {msg.sources.map((src, i) => (
                  <SourceCard
                    key={`${src.pmid}-${i}`}
                    source={src}
                    index={i}
                    validation={msg.validation}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Session Item ─────────────────────────────────────────────────────────────
function SessionItem({ session, isActive, onSelect, onDelete }) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div
      className={`session-item${isActive ? " active" : ""}`}
      onClick={() => onSelect(session.sessionId)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onSelect(session.sessionId)}
    >
      <div className="session-item-content">
        <span className="session-item-icon">💬</span>
        <span className="session-item-title">
          {session.title || "New Conversation"}
        </span>
      </div>
      <div className="session-item-actions">
        {confirmDelete ? (
          <>
            <button
              className="session-action-btn danger"
              title="Confirm delete"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(session.sessionId);
              }}
            >
              ✓
            </button>
            <button
              className="session-action-btn"
              title="Cancel"
              onClick={(e) => {
                e.stopPropagation();
                setConfirmDelete(false);
              }}
            >
              ✗
            </button>
          </>
        ) : (
          <button
            className="session-action-btn"
            title="Delete conversation"
            onClick={(e) => {
              e.stopPropagation();
              setConfirmDelete(true);
            }}
          >
            🗑
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Upload Zone ──────────────────────────────────────────────────────────────
function UploadZone({ onUploadComplete }) {
  const [isDragging, setIsDragging]   = useState(false);
  const [uploadStatus, setUploadStatus] = useState(null);
  const fileInputRef = useRef(null);

  const processFile = useCallback(async (file) => {
    if (!file) return;
    if (file.type !== "application/pdf" && file.type !== "text/plain") {
      setUploadStatus({ ok: false, message: "Only PDF and .txt files are supported." });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setUploadStatus({ ok: false, message: "File must be under 10 MB." });
      return;
    }

    setUploadStatus("uploading");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res  = await fetch(`${API}/upload`, { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setUploadStatus({ ok: true, message: data.message });
      onUploadComplete && onUploadComplete(data);
    } catch (err) {
      setUploadStatus({ ok: false, message: err.message || "Upload failed." });
    }
  }, [onUploadComplete]);

  return (
    <div className="upload-section">
      <div
        id="upload-zone"
        className={`upload-zone${isDragging ? " dragging" : ""}${uploadStatus === "uploading" ? " uploading" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          processFile(e.dataTransfer.files[0]);
        }}
        onClick={() => fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        aria-label="Upload PDF or text file"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.txt"
          style={{ display: "none" }}
          onChange={(e) => processFile(e.target.files[0])}
        />
        {uploadStatus === "uploading" ? (
          <>
            <span className="upload-spinner" />
            <span className="upload-text">Processing document…</span>
          </>
        ) : (
          <>
            <span className="upload-icon">📁</span>
            <span className="upload-text">Drop PDF or TXT to add to knowledge base</span>
          </>
        )}
      </div>

      {uploadStatus && uploadStatus !== "uploading" && (
        <div className={`upload-status ${uploadStatus.ok ? "ok" : "err"}`}>
          {uploadStatus.message}
          <button className="dismiss-btn" onClick={() => setUploadStatus(null)}>×</button>
        </div>
      )}
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
const EXAMPLE_QUESTIONS = [
  "What are the cardiovascular benefits of GLP-1 receptor agonists?",
  "How effective is CRISPR-Cas9 gene editing for sickle cell disease?",
  "What does the gut microbiome have to do with cancer immunotherapy response?",
];

const STREAMING_ID_PREFIX = "streaming-";

export default function App() {
  const [sessions,          setSessions]         = useState([]);
  const [currentSessionId,  setCurrentSessionId] = useState(null);
  const [messages,          setMessages]         = useState([]);
  const [question,          setQuestion]         = useState("");
  const [loading,           setLoading]          = useState(false);
  const [error,             setError]            = useState("");
  const [sidebarOpen,       setSidebarOpen]      = useState(true);

  const messagesEndRef = useRef(null);
  const textareaRef    = useRef(null);

  // ── Auto-scroll ──────────────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Load sessions on mount ───────────────────────────────────────────────────
  useEffect(() => {
    async function init() {
      await loadSessions();
      const saved = localStorage.getItem("curalink_session_id");
      if (saved) await loadSession(saved);
    }
    init();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Session management ───────────────────────────────────────────────────────
  async function loadSessions() {
    try {
      const res  = await fetch(`${API}/sessions`);
      const data = await res.json();
      setSessions(data.sessions || []);
    } catch {
      // non-critical
    }
  }

  async function createSession() {
    try {
      const res  = await fetch(`${API}/sessions`, { method: "POST" });
      const data = await res.json();
      const newSess = {
        sessionId:  data.sessionId,
        title:      data.title,
        createdAt:  new Date().toISOString(),
        updatedAt:  new Date().toISOString(),
      };
      setSessions((s) => [newSess, ...s]);
      setCurrentSessionId(data.sessionId);
      setMessages([]);
      localStorage.setItem("curalink_session_id", data.sessionId);
    } catch (err) {
      setError("Could not create session: " + err.message);
    }
  }

  async function loadSession(sessionId) {
    try {
      const res = await fetch(`${API}/sessions/${sessionId}`);
      if (!res.ok) {
        localStorage.removeItem("curalink_session_id");
        return;
      }
      const data = await res.json();
      setCurrentSessionId(sessionId);
      setMessages(data.messages || []);
      localStorage.setItem("curalink_session_id", sessionId);
    } catch {
      // non-critical
    }
  }

  async function deleteSession(sessionId) {
    try {
      await fetch(`${API}/sessions/${sessionId}`, { method: "DELETE" });
      setSessions((s) => s.filter((x) => x.sessionId !== sessionId));
      if (currentSessionId === sessionId) {
        setCurrentSessionId(null);
        setMessages([]);
        localStorage.removeItem("curalink_session_id");
      }
    } catch {
      // non-critical
    }
  }

  // ── Handle Ask ───────────────────────────────────────────────────────────────
  async function handleAsk(e) {
    e.preventDefault();
    const q = question.trim();
    if (!q || loading) return;

    // Auto-create session if none exists
    let sessionId = currentSessionId;
    if (!sessionId) {
      try {
        const res  = await fetch(`${API}/sessions`, { method: "POST" });
        const data = await res.json();
        sessionId  = data.sessionId;
        const newSess = {
          sessionId,
          title:     data.title,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        setSessions((s) => [newSess, ...s]);
        setCurrentSessionId(sessionId);
        localStorage.setItem("curalink_session_id", sessionId);
      } catch {
        setError("Failed to create conversation session.");
        return;
      }
    }

    setQuestion("");
    setError("");
    setLoading(true);

    // Reset textarea height
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    // Unique ID for the in-flight streaming message
    const streamId = `${STREAMING_ID_PREFIX}${Date.now()}`;

    // Optimistically append user message + streaming placeholder
    setMessages((prev) => [
      ...prev,
      { _id: `user-${Date.now()}`, role: "user",      content: q, createdAt: new Date().toISOString() },
      { _id: streamId,             role: "assistant",  content: "", sources: [], validation: null,
        streaming: true, createdAt: new Date().toISOString() },
    ]);

    try {
      const res = await fetch(`${API}/ask`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ question: q, sessionId }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Server error ${res.status}`);
      }

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer    = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data: ")) continue;

          try {
            const event = JSON.parse(trimmed.slice(6));

            if (event.type === "chunk") {
              setMessages((prev) =>
                prev.map((m) =>
                  m._id === streamId ? { ...m, content: m.content + event.text } : m
                )
              );
            } else if (event.type === "sources") {
              setMessages((prev) =>
                prev.map((m) =>
                  m._id === streamId ? { ...m, sources: event.sources || [] } : m
                )
              );
            } else if (event.type === "validation") {
              setMessages((prev) =>
                prev.map((m) =>
                  m._id === streamId
                    ? { ...m, validation: { valid: event.valid, invalid: event.invalid, uncited: event.uncited } }
                    : m
                )
              );
            } else if (event.type === "done") {
              setMessages((prev) =>
                prev.map((m) =>
                  m._id === streamId ? { ...m, streaming: false } : m
                )
              );
              // Update session title in sidebar after first answer
              setSessions((s) =>
                s.map((sess) =>
                  sess.sessionId === sessionId
                    ? { ...sess, title: q.slice(0, 60) + (q.length > 60 ? "…" : ""), updatedAt: new Date().toISOString() }
                    : sess
                )
              );
            } else if (event.type === "error") {
              setError(event.message || "An error occurred.");
              setMessages((prev) => prev.filter((m) => m._id !== streamId));
            }
          } catch {
            // Ignore malformed JSON frames
          }
        }
      }
    } catch (err) {
      setError(err.message || "Failed to connect to the server.");
      setMessages((prev) => prev.filter((m) => m._id !== streamId));
    } finally {
      setLoading(false);
    }
  }

  // ── Textarea auto-resize ─────────────────────────────────────────────────────
  function handleTextareaChange(e) {
    setQuestion(e.target.value);
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = "auto";
      ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleAsk(e);
    }
  }

  const currentSession = sessions.find((s) => s.sessionId === currentSessionId);

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="app">
      {/* ── Sidebar ── */}
      <aside className={`sidebar${sidebarOpen ? "" : " collapsed"}`} aria-label="Navigation sidebar">
        {/* Logo + new chat */}
        <div className="sidebar-header">
          <div className="logo">
            <span className="logo-icon">🧬</span>
            <span className="logo-text">Curalink</span>
          </div>
          <button
            id="new-chat-btn"
            className="new-chat-btn"
            onClick={createSession}
            title="Start new conversation"
            aria-label="New conversation"
          >
            ✏️
          </button>
        </div>

        {/* Conversations */}
        <div className="sidebar-section-label">Conversations</div>
        <div className="sessions-list" role="list">
          {sessions.length === 0 ? (
            <div className="sessions-empty">No conversations yet — start by asking a question!</div>
          ) : (
            sessions.map((s) => (
              <SessionItem
                key={s.sessionId}
                session={s}
                isActive={s.sessionId === currentSessionId}
                onSelect={loadSession}
                onDelete={deleteSession}
              />
            ))
          )}
        </div>

        {/* Upload + footer */}
        <div className="sidebar-bottom">
          <div className="sidebar-section-label">Add Documents</div>
          <UploadZone onUploadComplete={() => { /* could refresh doc list */ }} />
          <div className="sidebar-footer">
            <p>For research use only · Not medical advice</p>
          </div>
        </div>
      </aside>

      {/* ── Main Panel ── */}
      <div className="main-panel">
        {/* Header */}
        <header className="chat-header">
          <button
            className="sidebar-toggle"
            onClick={() => setSidebarOpen((o) => !o)}
            aria-label={sidebarOpen ? "Close sidebar" : "Open sidebar"}
            title={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
          >
            ☰
          </button>
          <div className="chat-header-center">
            <h1 className="chat-title">
              {currentSession?.title || "Medical Research Assistant"}
            </h1>
            <span className="chat-subtitle">Grounded in peer-reviewed PubMed literature</span>
          </div>
          <div className="chat-header-right">
            <div className="status-indicator" aria-live="polite">
              <span className="status-dot" />
              <span>{loading ? "Thinking…" : "AI Ready"}</span>
            </div>
          </div>
        </header>

        {/* Messages */}
        <div
          className="messages-container"
          role="log"
          aria-label="Conversation messages"
          aria-live="polite"
        >
          {/* Welcome screen when no messages */}
          {messages.length === 0 && !loading && (
            <div className="welcome-screen">
              <div className="welcome-icon">🧬</div>
              <h2>Curalink Medical Research Assistant</h2>
              <p>
                Ask questions grounded in peer-reviewed medical literature.
                Upload your own PDFs or research papers to include them in answers.
                Every answer is validated — hallucinated citations are flagged.
              </p>
              <div className="welcome-examples" role="list">
                {EXAMPLE_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    className="example-btn"
                    role="listitem"
                    onClick={() => {
                      setQuestion(q);
                      textareaRef.current?.focus();
                    }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Conversation messages */}
          {messages.map((msg, i) => (
            <MessageBubble key={msg._id?.toString() || i} msg={msg} />
          ))}

          {/* Error banner */}
          {error && (
            <div className="error-banner" role="alert">
              <span>⚠️ {error}</span>
              <button onClick={() => setError("")} aria-label="Dismiss error">×</button>
            </div>
          )}

          {/* Scroll anchor */}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="input-area">
          <form className="input-form" onSubmit={handleAsk} aria-label="Ask a question">
            <div className="input-box">
              <textarea
                ref={textareaRef}
                id="question-input"
                className="question-textarea"
                placeholder="Ask a medical research question… (Enter to send, Shift+Enter for new line)"
                value={question}
                onChange={handleTextareaChange}
                onKeyDown={handleKeyDown}
                disabled={loading}
                rows={1}
                aria-label="Research question input"
              />
              <button
                id="submit-btn"
                type="submit"
                className="send-btn"
                disabled={loading || !question.trim()}
                aria-label="Send question"
              >
                {loading ? <span className="spinner" /> : "➤"}
              </button>
            </div>
            <div className="input-footer">
              <span>Powered by Gemini · Grounded in PubMed</span>
              <span>Enter to send · Shift+Enter for new line</span>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

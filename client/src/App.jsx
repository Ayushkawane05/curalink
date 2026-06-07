import { useState, useRef } from "react";

/**
 * App — Single-page Curalink interface.
 *
 * - A text input for the user's medical research question
 * - A submit button
 * - A streamed answer area (tokens arrive via SSE)
 * - A "Sources" panel showing cited paper titles + PMIDs
 */
export default function App() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const answerRef = useRef(null);

  /**
   * Send the question to POST /api/ask and consume the SSE stream.
   * Uses plain fetch + a ReadableStream reader — no library needed.
   */
  async function handleAsk(e) {
    e.preventDefault();
    if (!question.trim() || loading) return;

    setAnswer("");
    setSources([]);
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: question.trim() }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `Server error ${res.status}`);
      }

      // Read the SSE stream using a reader on the response body
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // SSE format: "data: {...}\n\n"
        const lines = buffer.split("\n\n");
        // Keep the last partial chunk in the buffer
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data: ")) continue;
          const json = trimmed.slice(6); // remove "data: "

          try {
            const event = JSON.parse(json);

            if (event.type === "chunk") {
              setAnswer((prev) => prev + event.text);
              // Auto-scroll the answer area
              if (answerRef.current) {
                answerRef.current.scrollTop = answerRef.current.scrollHeight;
              }
            } else if (event.type === "sources") {
              setSources(event.sources || []);
            } else if (event.type === "error") {
              setError(event.message || "An error occurred.");
            }
            // "done" — nothing special to handle
          } catch {
            // Ignore malformed JSON
          }
        }
      }
    } catch (err) {
      setError(err.message || "Failed to connect to the server.");
    } finally {
      setLoading(false);
    }
  }

  /**
   * Minimal markdown-like rendering for the streamed answer.
   * Handles bold (**text**), headings (### / ## / #), horizontal rules (---),
   * and newlines. Good enough for an MVP without pulling in a markdown lib.
   */
  function renderAnswer(text) {
    if (!text) return null;

    return text.split("\n").map((line, i) => {
      // Horizontal rule
      if (/^-{3,}$/.test(line.trim())) {
        return <hr key={i} className="answer-hr" />;
      }
      // Headings
      if (line.startsWith("### ")) {
        return <h4 key={i} className="answer-h4">{renderInline(line.slice(4))}</h4>;
      }
      if (line.startsWith("## ")) {
        return <h3 key={i} className="answer-h3">{renderInline(line.slice(3))}</h3>;
      }
      if (line.startsWith("# ")) {
        return <h2 key={i} className="answer-h2">{renderInline(line.slice(2))}</h2>;
      }
      // Normal paragraph
      return (
        <p key={i} className="answer-line">
          {renderInline(line)}
        </p>
      );
    });
  }

  /** Simple inline bold + italic rendering */
  function renderInline(text) {
    // Split by **bold** markers
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={i}>{part.slice(2, -2)}</strong>;
      }
      return part;
    });
  }

  return (
    <div className="app">
      {/* ── Header ── */}
      <header className="header">
        <div className="header-inner">
          <div className="logo">
            <span className="logo-icon">🧬</span>
            <h1>Curalink</h1>
          </div>
          <p className="tagline">AI-Powered Medical Research Assistant</p>
        </div>
      </header>

      {/* ── Main content ── */}
      <main className="main">
        {/* Question form */}
        <form className="ask-form" onSubmit={handleAsk}>
          <div className="input-row">
            <input
              id="question-input"
              type="text"
              className="question-input"
              placeholder="Ask a medical research question…"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              disabled={loading}
              autoFocus
            />
            <button
              id="submit-btn"
              type="submit"
              className="submit-btn"
              disabled={loading || !question.trim()}
            >
              {loading ? (
                <span className="spinner" />
              ) : (
                <span>Ask →</span>
              )}
            </button>
          </div>
        </form>

        {/* Error */}
        {error && (
          <div className="error-banner" id="error-banner">
            ⚠️ {error}
          </div>
        )}

        {/* Answer area */}
        {(answer || loading) && (
          <section className="answer-section" id="answer-section">
            <h2 className="section-title">Answer</h2>
            <div className="answer-card" ref={answerRef}>
              {answer ? (
                <div className="answer-content">{renderAnswer(answer)}</div>
              ) : (
                <div className="answer-placeholder">
                  <span className="pulse-dot" />
                  Searching research papers and generating answer…
                </div>
              )}
            </div>
          </section>
        )}

        {/* Sources */}
        {sources.length > 0 && (
          <section className="sources-section" id="sources-section">
            <h2 className="section-title">
              Sources
              <span className="source-count">{sources.length}</span>
            </h2>
            <ul className="sources-list">
              {sources.map((s, i) => (
                <li key={i} className="source-item">
                  <span className="source-badge">{i + 1}</span>
                  <div className="source-info">
                    <span className="source-title">{s.title}</span>
                    <a
                      className="source-pmid"
                      href={`https://pubmed.ncbi.nlm.nih.gov/${s.pmid}/`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      PMID: {s.pmid} ↗
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>

      {/* ── Footer ── */}
      <footer className="footer">
        <p>
          Curalink — For research purposes only. Not a substitute for
          professional medical advice.
        </p>
      </footer>
    </div>
  );
}

import React, { useState, useEffect, useRef } from "react";
import {
  fetchYouTubeNotes,
  queryYouTubeRAG,
  fetchPdfNotes,
  queryPdfRAG,
  fetchArticleNotes,
  queryArticleRAG,
  fetchWebResearchNotes,
  queryWebResearch,
} from "../api";

const LANGUAGES = [
  { code: "English", label: "English 🇺🇸" },
  { code: "Hindi", label: "Hindi (हिन्दी) 🇮🇳" },
  { code: "Hinglish", label: "Hinglish 🇮🇳" },
  { code: "Spanish", label: "Spanish (Español) 🇪🇸" },
  { code: "French", label: "French (Français) 🇫🇷" },
];

// Clean, native renderer for natural AI notes and bullet points (like YouTube Ask AI)
const renderFormattedNotes = (text) => {
  if (!text) return null;
  const lines = text.split("\n");

  const formatInline = (str) => {
    const parts = str.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={i} style={{ color: "#f8fafc" }}>{part.slice(2, -2)}</strong>;
      }
      return part;
    });
  };

  return (
    <div className="natural-notes-body" style={{ lineHeight: 1.8, fontSize: "0.95rem" }}>
      {lines.map((line, idx) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={idx} style={{ height: "10px" }} />;

        if (trimmed.startsWith("### ")) {
          return (
            <h5 key={idx} style={{ fontSize: "1.05rem", fontWeight: 600, color: "var(--accent-cyan)", margin: "16px 0 6px" }}>
              {formatInline(trimmed.replace(/^###\s+/, ""))}
            </h5>
          );
        }
        if (trimmed.startsWith("## ")) {
          return (
            <h4 key={idx} style={{ fontSize: "1.2rem", fontWeight: 700, color: "var(--primary-light)", margin: "22px 0 8px", borderBottom: "1px solid rgba(255,255,255,0.08)", paddingBottom: "4px" }}>
              {formatInline(trimmed.replace(/^##\s+/, ""))}
            </h4>
          );
        }
        if (trimmed.startsWith("# ")) {
          return (
            <h3 key={idx} style={{ fontSize: "1.35rem", fontWeight: 800, margin: "24px 0 10px", color: "var(--text-main)" }}>
              {formatInline(trimmed.replace(/^#\s+/, ""))}
            </h3>
          );
        }

        // Bullet points: -, *, •
        if (/^[-*•]\s+/.test(trimmed)) {
          return (
            <div key={idx} style={{ display: "flex", gap: "10px", margin: "6px 0", paddingLeft: "6px" }}>
              <span style={{ color: "var(--accent-cyan)", fontWeight: 700 }}>•</span>
              <span style={{ color: "#e2e8f0" }}>{formatInline(trimmed.replace(/^[-*•]\s+/, ""))}</span>
            </div>
          );
        }

        // Numbered list: 1., 2.
        if (/^\d+\.\s+/.test(trimmed)) {
          const numMatch = trimmed.match(/^(\d+\.)\s+(.*)/);
          return (
            <div key={idx} style={{ display: "flex", gap: "8px", margin: "6px 0", paddingLeft: "6px" }}>
              <span style={{ color: "var(--primary-light)", fontWeight: 600 }}>{numMatch[1]}</span>
              <span style={{ color: "#e2e8f0" }}>{formatInline(numMatch[2])}</span>
            </div>
          );
        }

        return (
          <p key={idx} style={{ margin: "8px 0", color: "#cbd5e1" }}>
            {formatInline(trimmed)}
          </p>
        );
      })}
    </div>
  );
};

export default function LearningWorkspace({ source, onBackToOnboarding }) {
  const [activeTab, setActiveTab] = useState("notes");
  const [selectedLanguage, setSelectedLanguage] = useState("English");

  // Notes state
  const [notesData, setNotesData] = useState(null);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [notesError, setNotesError] = useState("");

  // Q&A state
  const [qaMessages, setQaMessages] = useState([
    {
      id: "intro",
      role: "assistant",
      content: `Hello! I am your AI learning assistant for this ${source.sourceType}. Ask me anything about this content in English, Hindi, Hinglish, Spanish, or French!`,
    },
  ]);
  const [qaInput, setQaInput] = useState("");
  const [qaLoading, setQaLoading] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const qaEndRef = useRef(null);

  // Auto scroll in Q&A
  useEffect(() => {
    qaEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [qaMessages, qaLoading]);

  // Load notes whenever source or language changes
  useEffect(() => {
    loadNotes(selectedLanguage);
  }, [selectedLanguage, source.sourceId]);

  const loadNotes = async (lang, force = false) => {
    setLoadingNotes(true);
    setNotesError("");

    try {
      let res;
      if (source.sourceType === "youtube") {
        res = await fetchYouTubeNotes({
          url: source.url,
          sourceId: source.sourceId,
          language: lang,
          forceRegenerate: force,
        });
      } else if (source.sourceType === "pdf") {
        res = await fetchPdfNotes({
          documentId: source.sourceId,
          language: lang,
        });
      } else if (source.sourceType === "article") {
        res = await fetchArticleNotes({
          url: source.url,
          sourceId: source.sourceId,
          language: lang,
        });
      } else if (source.sourceType === "web") {
        res = await fetchWebResearchNotes({
          sourceId: source.sourceId,
          language: lang,
        });
      }

      setNotesData(res?.detailednotesSummary || null);
    } catch (err) {
      console.error(err);
      setNotesError(err.message || "Failed to load summary & notes");
    } finally {
      setLoadingNotes(false);
    }
  };

  // Handle Q&A question submission
  const handleSendQa = async (e) => {
    e?.preventDefault();
    const query = qaInput.trim();
    if (!query || qaLoading) return;

    setQaInput("");
    setQaMessages((prev) => [
      ...prev,
      { id: Date.now(), role: "user", content: query },
    ]);
    setQaLoading(true);

    try {
      let res;
      if (source.sourceType === "youtube") {
        res = await queryYouTubeRAG({
          url: source.url,
          sourceId: source.sourceId,
          userquery: query,
          language: selectedLanguage,
        });
      } else if (source.sourceType === "pdf") {
        res = await queryPdfRAG({
          documentId: source.sourceId,
          userquery: query,
          language: selectedLanguage,
        });
      } else if (source.sourceType === "article") {
        res = await queryArticleRAG({
          url: source.url,
          sourceId: source.sourceId,
          userquery: query,
          language: selectedLanguage,
        });
      } else if (source.sourceType === "web") {
        res = await queryWebResearch({
          sourceId: source.sourceId,
          userquery: query,
          language: selectedLanguage,
        });
      }

      setQaMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          role: "assistant",
          content: res.answer,
          sources: res.sources || [],
          debug: res.debug,
          language: res.language || selectedLanguage,
        },
      ]);
    } catch (err) {
      console.error(err);
      setQaMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          role: "assistant",
          content: `Error retrieving answer: ${err.message}. Please try again.`,
        },
      ]);
    } finally {
      setQaLoading(false);
    }
  };

  return (
    <div className="workspace-container">
      {/* 1. TOP SOURCE METADATA CARD */}
      <div className="workspace-source-card">
        <div className="source-info">
          <span className={`source-type-pill ${source.sourceType}`}>
            {source.sourceType === "youtube" && "🎥 YouTube"}
            {source.sourceType === "pdf" && "📄 PDF"}
            {source.sourceType === "article" && "🌐 Article"}
            {source.sourceType === "web" && "🔍 Web Research"}
          </span>
          <div>
            <h2 className="source-title">{source.title || "Untitled Learning Material"}</h2>
            <div className="source-meta">
              {source.url && <span>Source: {source.url.substring(0, 70)}...</span>}
              {source.documentId && <span>Document ID: {source.documentId}</span>}
            </div>
          </div>
        </div>

        <div className="header-actions">
          {/* Response Language Selector */}
          <div className="lang-selector-wrapper">
            <span className="lang-selector-label">Language:</span>
            <select
              className="lang-select"
              value={selectedLanguage}
              onChange={(e) => setSelectedLanguage(e.target.value)}
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            className="btn btn-ghost"
            onClick={onBackToOnboarding}
          >
            ← Change Source
          </button>
        </div>
      </div>

      {/* 2. FEATURE TABS */}
      <div className="workspace-tabs">
        <button
          type="button"
          className={`workspace-tab-btn ${activeTab === "notes" ? "active" : ""}`}
          onClick={() => setActiveTab("notes")}
        >
          📝 Summary & Notes
        </button>

        <button
          type="button"
          className={`workspace-tab-btn ${activeTab === "qa" ? "active" : ""}`}
          onClick={() => setActiveTab("qa")}
        >
          💬 Q&A Chatbot
        </button>

        <button
          type="button"
          className={`workspace-tab-btn ${activeTab === "quiz" ? "active" : ""}`}
          onClick={() => setActiveTab("quiz")}
        >
          🎯 Quiz (Phase 2)
        </button>

        <button
          type="button"
          className={`workspace-tab-btn ${activeTab === "translate" ? "active" : ""}`}
          onClick={() => setActiveTab("translate")}
        >
          🌐 Multilingual
        </button>
      </div>

      {/* 3. MAIN WORKSPACE CONTENT */}
      <div className="workspace-content">
        {/* TAB 1: SUMMARY & DETAILED NOTES */}
        {activeTab === "notes" && (
          <div className="notes-container">
            <div className="notes-header">
              <div>
                <h3 style={{ fontSize: "1.25rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <span>Structured Notes & Summary ({selectedLanguage})</span>
                  {notesData?.contentType === "music_song" && (
                    <span style={{ fontSize: "0.75rem", padding: "2px 8px", background: "rgba(236, 72, 153, 0.2)", border: "1px solid rgba(236, 72, 153, 0.4)", borderRadius: "12px", color: "#f472b6", fontWeight: 500 }}>
                      🎵 Song / Music
                    </span>
                  )}
                  {notesData?.contentType === "technical" && (
                    <span style={{ fontSize: "0.75rem", padding: "2px 8px", background: "rgba(59, 130, 246, 0.2)", border: "1px solid rgba(59, 130, 246, 0.4)", borderRadius: "12px", color: "#60a5fa", fontWeight: 500 }}>
                      💻 Technical
                    </span>
                  )}
                  {notesData?.contentType === "podcast_interview" && (
                    <span style={{ fontSize: "0.75rem", padding: "2px 8px", background: "rgba(168, 85, 247, 0.2)", border: "1px solid rgba(168, 85, 247, 0.4)", borderRadius: "12px", color: "#c084fc", fontWeight: 500 }}>
                      🎙️ Podcast / Talk
                    </span>
                  )}
                </h3>
                <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
                  {notesData?.contentType === "music_song"
                    ? "AI-extracted lyrical themes, emotional meaning, and memorable lines."
                    : "AI-extracted core concepts, takeaways, and revision materials."}
                </p>
              </div>

              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => loadNotes(selectedLanguage, true)}
                  disabled={loadingNotes}
                >
                  🔄 Regenerate
                </button>
              </div>
            </div>

            {loadingNotes ? (
              <div style={{ textAlign: "center", padding: "60px 0" }}>
                <div className="spinner" style={{ width: "32px", height: "32px", margin: "0 auto 16px" }}></div>
                <p style={{ fontWeight: 600 }}>
                  Generating comprehensive notes in {selectedLanguage}...
                </p>
                <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginTop: "4px" }}>
                  Analyzing content, core themes, and key takeaways.
                </p>
              </div>
            ) : notesError ? (
              <div style={{ padding: "24px", background: "rgba(239, 68, 68, 0.1)", borderRadius: "8px", border: "1px solid rgba(239, 68, 68, 0.3)" }}>
                <p style={{ color: "#f87171", fontWeight: 600 }}>Error loading notes</p>
                <p style={{ fontSize: "0.85rem", color: "#fca5a5" }}>{notesError}</p>
                <button className="btn btn-primary" style={{ marginTop: "12px" }} onClick={() => loadNotes(selectedLanguage, true)}>
                  Try Again
                </button>
              </div>
            ) : typeof notesData === "string" ? (
              <div className="notes-overview-box" style={{ background: "rgba(255, 255, 255, 0.02)", padding: "24px 28px", borderRadius: "12px", border: "1px solid rgba(255, 255, 255, 0.08)" }}>
                {renderFormattedNotes(notesData)}
              </div>
            ) : notesData ? (
              <>
                {/* Title */}
                {notesData.title && (
                  <div style={{ marginBottom: "16px", padding: "12px 16px", background: "rgba(255, 255, 255, 0.03)", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.08)" }}>
                    <h4 style={{ fontSize: "1.1rem", fontWeight: 600, color: "var(--text-main)" }}>
                      🎬 {notesData.title}
                    </h4>
                  </div>
                )}

                {/* Overview */}
                {notesData.overview && (
                  <div className="notes-overview-box">
                    <h4 style={{ color: "var(--primary-light)", marginBottom: "6px", fontSize: "0.95rem" }}>
                      {notesData.contentType === "music_song" ? "🎵 Song Meaning & Emotional Overview" : "📌 Overview"}
                    </h4>
                    <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{notesData.overview}</p>
                  </div>
                )}

                {/* Key Takeaways */}
                {Array.isArray(notesData.keyTakeaways) && notesData.keyTakeaways.length > 0 && (
                  <div>
                    <h4 style={{ marginBottom: "12px", fontSize: "1rem", fontWeight: 600 }}>
                      {notesData.contentType === "music_song" ? "✨ Key Themes & Emotional Motifs" : "⚡ Key Takeaways"}
                    </h4>
                    <div className="takeaways-grid">
                      {notesData.keyTakeaways.map((item, idx) => (
                        <div key={idx} className="takeaway-card">
                          <span className="takeaway-bullet">✓</span>
                          <span>{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Topics Breakdown */}
                {Array.isArray(notesData.topics) && notesData.topics.length > 0 && (
                  <div className="topic-section">
                    <h4 style={{ fontSize: "1rem", fontWeight: 600 }}>
                      {notesData.contentType === "music_song" ? "🎶 Lyrical Themes & Verses" : "📖 Core Topics & Explanations"}
                    </h4>
                    {notesData.topics.map((t, idx) => (
                      <div key={idx} className="topic-card">
                        <h4>{t.topic}</h4>
                        <p>{t.explanation}</p>
                        {Array.isArray(t.importantPoints) && t.importantPoints.length > 0 && (
                          <ul style={{ paddingLeft: "20px", fontSize: "0.875rem", color: "#cbd5e1", marginTop: "8px" }}>
                            {t.importantPoints.map((pt, pIdx) => (
                              <li key={pIdx} style={{ marginBottom: "4px" }}>{pt}</li>
                            ))}
                          </ul>
                        )}
                        {Array.isArray(t.examples) && t.examples.length > 0 && (
                          <div style={{ marginTop: "8px", fontStyle: "italic", fontSize: "0.82rem", color: "var(--accent-cyan)" }}>
                            {t.examples.map((ex, eIdx) => (
                              <div key={eIdx}>💬 "{ex}"</div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Definitions / Poetic Vocabulary */}
                {Array.isArray(notesData.importantDefinitions) && notesData.importantDefinitions.length > 0 && (
                  <div>
                    <h4 style={{ marginBottom: "12px", fontSize: "1rem", fontWeight: 600 }}>
                      {notesData.contentType === "music_song" ? "💡 Poetic Expressions & Vocabulary" : "💡 Important Definitions & Concepts"}
                    </h4>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "10px" }}>
                      {notesData.importantDefinitions.map((def, idx) => (
                        <div key={idx} className="definition-pill">
                          <strong style={{ color: "var(--accent-cyan)" }}>{def.term}: </strong>
                          <span>{def.definition}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Quick Revision Flashcards */}
                {Array.isArray(notesData.quickRevision) && notesData.quickRevision.length > 0 && (
                  <div style={{ marginTop: "10px" }}>
                    <h4 style={{ marginBottom: "12px", fontSize: "1rem", fontWeight: 600 }}>
                      {notesData.contentType === "music_song" ? "🌟 Memorable Highlights & Key Lines" : "🎯 Quick Revision Points"}
                    </h4>
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      {notesData.quickRevision.map((rev, idx) => (
                        <div key={idx} style={{ background: "rgba(16, 185, 129, 0.05)", border: "1px solid rgba(16, 185, 129, 0.2)", borderRadius: "8px", padding: "10px 14px", fontSize: "0.875rem" }}>
                          • {rev}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p style={{ color: "var(--text-muted)" }}>No notes generated yet.</p>
            )}
          </div>
        )}

        {/* TAB 2: LEARNING Q&A CHATBOT */}
        {activeTab === "qa" && (
          <div className="qa-layout">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                Source-isolated RAG: Searches only chunks belonging to this {source.sourceType}.
              </span>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ fontSize: "0.75rem", padding: "4px 8px" }}
                onClick={() => setShowDebug(!showDebug)}
              >
                {showDebug ? "Hide Debug" : "Show Retrieval Debug"}
              </button>
            </div>

            <div className="qa-messages">
              {qaMessages.map((msg) => (
                <div key={msg.id} className={`message-bubble ${msg.role}`}>
                  <div className={`message-avatar ${msg.role}`}>
                    {msg.role === "assistant" ? "🤖" : "👤"}
                  </div>
                  <div className="message-content">
                    <p style={{ whiteSpace: "pre-wrap" }}>{msg.content}</p>

                    {/* Sources Badge */}
                    {Array.isArray(msg.sources) && msg.sources.length > 0 && (
                      <div>
                        <span className="qa-source-badge">
                          📌 {msg.sources.length} Retrieved Context Chunks (Top Score: {(msg.sources[0]?.score * 100)?.toFixed(1)}%)
                        </span>
                      </div>
                    )}

                    {/* Retrieval Debugging Output */}
                    {showDebug && msg.debug && (
                      <div className="debug-box">
                        <strong>[RAG Retrieval Debug]</strong><br />
                        Query: {msg.debug.query}<br />
                        Language: {msg.debug.language}<br />
                        Chunks retrieved: {msg.debug.chunksRetrievedCount}<br />
                        Top Results:<br />
                        {msg.debug.topResults?.map((r, i) => (
                          <div key={i} style={{ marginTop: "4px", paddingLeft: "8px" }}>
                            • Score: {r.score?.toFixed(4)} | "{r.textSnippet?.substring(0, 100)}..."
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {qaLoading && (
                <div className="message-bubble assistant">
                  <div className="message-avatar assistant">🤖</div>
                  <div className="message-content">
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <div className="spinner"></div>
                      <span style={{ fontSize: "0.85rem" }}>
                        Retrieving relevant chunks with BGE-M3 & generating response in {selectedLanguage}...
                      </span>
                    </div>
                  </div>
                </div>
              )}

              <div ref={qaEndRef} />
            </div>

            {/* Q&A Input */}
            <form className="chat-input-bar" style={{ borderRadius: "var(--radius-sm)" }} onSubmit={handleSendQa}>
              <input
                type="text"
                className="chat-input"
                value={qaInput}
                onChange={(e) => setQaInput(e.target.value)}
                disabled={qaLoading}
                placeholder={`Ask any question about this ${source.sourceType} (e.g. in English, Hindi, Hinglish)...`}
              />
              <button
                type="submit"
                className="btn btn-primary"
                disabled={!qaInput.trim() || qaLoading}
              >
                Ask
              </button>
            </form>
          </div>
        )}

        {/* TAB 3: QUIZ (LATER PHASE PLACEHOLDER) */}
        {activeTab === "quiz" && (
          <div style={{ textAlign: "center", padding: "60px 20px", maxWidth: "600px", margin: "0 auto" }}>
            <div style={{ fontSize: "3rem", marginBottom: "16px" }}>🎯</div>
            <h3 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "8px" }}>
              Quiz Mode (Coming Soon)
            </h3>
            <p style={{ color: "var(--text-muted)", fontSize: "0.95rem", lineHeight: 1.6 }}>
              In the upcoming phase, you will be able to test your mastery with AI-generated quizzes,
              multiple-choice questions, and active-recall flashcards generated directly from this learning source.
            </p>
            <div style={{ display: "flex", gap: "10px", justifyContent: "center", marginTop: "24px" }}>
              <span className="brand-badge">⚡ Multiple Choice</span>
              <span className="brand-badge">🧠 Conceptual Check</span>
              <span className="brand-badge">📊 Progress Score</span>
            </div>
          </div>
        )}

        {/* TAB 4: TRANSLATION / MULTILINGUAL CAPABILITIES */}
        {activeTab === "translate" && (
          <div style={{ padding: "20px 0" }}>
            <h3 style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: "8px" }}>
              Multilingual Learning Mode
            </h3>
            <p style={{ color: "var(--text-muted)", fontSize: "0.925rem", marginBottom: "20px" }}>
              Your learning workspace natively supports cross-language semantic retrieval and generation across 5 languages:
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "14px" }}>
              {LANGUAGES.map((l) => (
                <div
                  key={l.code}
                  onClick={() => {
                    setSelectedLanguage(l.code);
                    setActiveTab("notes");
                  }}
                  style={{
                    background: selectedLanguage === l.code ? "rgba(99, 102, 241, 0.15)" : "rgba(255, 255, 255, 0.03)",
                    border: `1px solid ${selectedLanguage === l.code ? "var(--primary)" : "var(--border-subtle)"}`,
                    borderRadius: "12px",
                    padding: "16px",
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                  }}
                >
                  <h4 style={{ color: selectedLanguage === l.code ? "var(--primary-light)" : "#fff", marginBottom: "4px" }}>
                    {l.label}
                  </h4>
                  <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                    Click to load notes & chat in {l.code}.
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

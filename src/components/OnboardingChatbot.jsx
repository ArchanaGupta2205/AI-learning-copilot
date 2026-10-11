import React, { useState, useRef, useEffect } from "react";
import {
  chatWithInputbot,
  fetchYouTubeTranscript,
  indexYouTubeRAG,
  uploadPdfDocument,
  indexPdfRAG,
  extractArticle,
  indexArticleRAG,
  searchAndIndexWeb,
} from "../api";

export default function OnboardingChatbot({ onSourceReady }) {
  const [messages, setMessages] = useState([
    {
      id: "init",
      role: "assistant",
      content:
        "Hi! What would you like to learn from today? You can choose a YouTube Video, PDF, Article / Website, or Search the Web.",
      showOptions: true,
    },
  ]);
  const [input, setInput] = useState("");
  const [botState, setBotState] = useState("idle");
  const [selectedSource, setSelectedSource] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isProcessing, statusMessage]);

  const addAssistantMessage = (content, extra = {}) => {
    setMessages((prev) => [
      ...prev,
      {
        id: Date.now() + Math.random(),
        role: "assistant",
        content,
        ...extra,
      },
    ]);
  };

  const addUserMessage = (content) => {
    setMessages((prev) => [
      ...prev,
      {
        id: Date.now() + Math.random(),
        role: "user",
        content,
      },
    ]);
  };

  // ----------------------------------------------------
  // SOURCE 1: YOUTUBE PROCESSING
  // ----------------------------------------------------
  const processYouTubeUrl = async (url) => {
    setIsProcessing(true);
    setStatusMessage("Extracting YouTube transcript & saving to MongoDB...");

    try {
      const transcriptRes = await fetchYouTubeTranscript(url);
      const videoData = transcriptRes.data || {};
      const sourceId = videoData._id;

      setStatusMessage("Chunking transcript & generating BGE-M3 embeddings in Qdrant...");
      const ragRes = await indexYouTubeRAG(url, sourceId);

      addAssistantMessage("Video processed and indexed successfully! Taking you to your Learning Workspace...");

      setTimeout(() => {
        onSourceReady({
          sourceType: "youtube",
          sourceId: ragRes.sourceId || sourceId,
          title: ragRes.title || videoData.title || `YouTube Video (${videoData.videoId || "lecture"})`,
          url: url,
          status: "ready",
          features: ["summary", "notes", "qa"],
        });
      }, 1000);
    } catch (err) {
      console.error(err);
      addAssistantMessage(`Error processing YouTube video: ${err.message}. Please check the URL and try again.`);
      setIsProcessing(false);
      setStatusMessage("");
    }
  };

  // ----------------------------------------------------
  // SOURCE 2: PDF PROCESSING
  // ----------------------------------------------------
  const handlePdfUpload = async (file) => {
    if (!file) return;
    setIsProcessing(true);
    setStatusMessage(`Uploading ${file.name} and extracting text...`);

    try {
      const uploadRes = await uploadPdfDocument(file);
      const documentId = uploadRes.documentId || uploadRes.sourceId;

      setStatusMessage("Chunking PDF text & storing BGE-M3 embeddings in Qdrant...");
      const ragRes = await indexPdfRAG(documentId);

      addAssistantMessage("PDF processed and indexed into Qdrant! Opening your Learning Workspace...");

      setTimeout(() => {
        onSourceReady({
          sourceType: "pdf",
          sourceId: documentId,
          documentId,
          title: uploadRes.fileName || file.name,
          status: "ready",
          features: ["summary", "notes", "qa"],
        });
      }, 1000);
    } catch (err) {
      console.error(err);
      addAssistantMessage(`Error uploading PDF: ${err.message}. Please try again.`);
      setIsProcessing(false);
      setStatusMessage("");
    }
  };

  // ----------------------------------------------------
  // SOURCE 3: ARTICLE PROCESSING
  // ----------------------------------------------------
  const processArticleUrl = async (url) => {
    setIsProcessing(true);
    setStatusMessage("Fetching webpage with Cheerio & saving article to MongoDB...");

    try {
      const extractRes = await extractArticle(url);
      const articleId = extractRes.articleId || extractRes.sourceId;

      setStatusMessage("Chunking article & indexing BGE-M3 embeddings into Qdrant...");
      const ragRes = await indexArticleRAG(url, articleId);

      addAssistantMessage("Article extracted and indexed! Taking you to your Learning Workspace...");

      setTimeout(() => {
        onSourceReady({
          sourceType: "article",
          sourceId: ragRes.sourceId || articleId,
          title: extractRes.title || ragRes.title || "Web Article",
          url: url,
          status: "ready",
          features: ["summary", "notes", "qa"],
        });
      }, 1000);
    } catch (err) {
      console.error(err);
      addAssistantMessage(`Error extracting article: ${err.message}. Please check the URL and try again.`);
      setIsProcessing(false);
      setStatusMessage("");
    }
  };

  // ----------------------------------------------------
  // SOURCE 4: WEB RESEARCH PROCESSING
  // ----------------------------------------------------
  const processWebResearchQuery = async (topic) => {
    setIsProcessing(true);
    setStatusMessage(`Searching Tavily & scraping web resources for "${topic}"...`);

    try {
      setStatusMessage("Extracting readable content & indexing into Qdrant knowledge base...");
      const webRes = await searchAndIndexWeb(topic);

      addAssistantMessage(`Web research on "${topic}" completed and indexed! Entering Learning Workspace...`);

      setTimeout(() => {
        onSourceReady({
          sourceType: "web",
          sourceId: webRes.sourceId,
          title: webRes.title || topic,
          url: webRes.url,
          topic: topic,
          status: "ready",
          features: ["summary", "notes", "qa"],
        });
      }, 1000);
    } catch (err) {
      console.error(err);
      addAssistantMessage(`Error conducting web research: ${err.message}. Please try another topic.`);
      setIsProcessing(false);
      setStatusMessage("");
    }
  };

  // ----------------------------------------------------
  // QUICK SOURCE BUTTON CLICKS
  // ----------------------------------------------------
  const handleSelectSource = (type) => {
    setSelectedSource(type);
    if (type === "youtube") {
      addUserMessage("YouTube Video");
      setBotState("waiting_for_youtube_url");
      addAssistantMessage("Great! Please enter or paste the YouTube video URL.");
    } else if (type === "pdf") {
      addUserMessage("PDF Document");
      setBotState("waiting_for_pdf");
      addAssistantMessage("Great! Please select or drop your PDF document below to upload.", {
        showPdfUpload: true,
      });
    } else if (type === "article") {
      addUserMessage("Article / Website");
      setBotState("waiting_for_article_url");
      addAssistantMessage("Sure! Please enter the article or website URL (e.g. https://example.com).");
    } else if (type === "web") {
      addUserMessage("Search the Web");
      setBotState("waiting_for_web_query");
      addAssistantMessage("Sure! What topic would you like to research and learn about from the web?");
    }
  };

  // ----------------------------------------------------
  // FORM / CHAT SUBMISSION HANDLER
  // ----------------------------------------------------
  const handleSend = async (e) => {
    e?.preventDefault();
    const query = input.trim();
    if (!query || isProcessing) return;

    setInput("");
    addUserMessage(query);

    // If currently waiting for YouTube URL
    if (botState === "waiting_for_youtube_url" || query.includes("youtube.com") || query.includes("youtu.be")) {
      await processYouTubeUrl(query);
      return;
    }

    // If waiting for Article URL
    if (botState === "waiting_for_article_url" || (query.startsWith("http://") || query.startsWith("https://"))) {
      await processArticleUrl(query);
      return;
    }

    // If waiting for Web Query
    if (botState === "waiting_for_web_query") {
      await processWebResearchQuery(query);
      return;
    }

    // Fallback: Call inputbot backend router to determine action
    try {
      const botRes = await chatWithInputbot(query, { state: botState, sourceType: selectedSource });
      setBotState(botRes.state);
      setSelectedSource(botRes.sourceType);

      if (botRes.nextAction === "process_youtube" && botRes.data?.url) {
        addAssistantMessage(botRes.response || "Processing YouTube video...");
        await processYouTubeUrl(botRes.data.url);
      } else if (botRes.nextAction === "process_article" && botRes.data?.url) {
        addAssistantMessage(botRes.response || "Processing article URL...");
        await processArticleUrl(botRes.data.url);
      } else if (botRes.nextAction === "process_web_research" && botRes.data?.query) {
        addAssistantMessage(botRes.response || `Researching "${botRes.data.query}" on the web...`);
        await processWebResearchQuery(botRes.data.query);
      } else if (botRes.nextAction === "upload_pdf") {
        addAssistantMessage(botRes.response || "Please upload your PDF file.", { showPdfUpload: true });
      } else {
        addAssistantMessage(botRes.response, { showOptions: botRes.state === "idle" });
      }
    } catch (err) {
      console.error(err);
      addAssistantMessage("Sorry, I had trouble processing that. What learning source do you have?", {
        showOptions: true,
      });
    }
  };

  return (
    <div className="onboarding-screen">
      <div className="onboarding-hero">
        <h1>Welcome to AI Learning Copilot</h1>
        <p>
          Your intelligent study assistant. Choose any learning source to generate
          in-depth notes, cross-language summaries, and a source-grounded Q&A chatbot.
        </p>
      </div>

      <div className="chat-card">
        <div className="chat-messages">
          {messages.map((msg) => (
            <div key={msg.id} className={`message-bubble ${msg.role}`}>
              <div className={`message-avatar ${msg.role}`}>
                {msg.role === "assistant" ? "🤖" : "👤"}
              </div>
              <div className="message-content">
                <p>{msg.content}</p>

                {/* Initial 4 Source Action Buttons */}
                {msg.showOptions && !isProcessing && (
                  <div className="source-selection-grid">
                    <button
                      type="button"
                      className="source-card-btn youtube"
                      onClick={() => handleSelectSource("youtube")}
                    >
                      <div className="source-icon-badge">🎥</div>
                      <div>
                        <h4>YouTube Video</h4>
                        <p>Extract transcripts & video notes</p>
                      </div>
                    </button>

                    <button
                      type="button"
                      className="source-card-btn pdf"
                      onClick={() => handleSelectSource("pdf")}
                    >
                      <div className="source-icon-badge">📄</div>
                      <div>
                        <h4>PDF Document</h4>
                        <p>Upload lecture notes or textbook</p>
                      </div>
                    </button>

                    <button
                      type="button"
                      className="source-card-btn article"
                      onClick={() => handleSelectSource("article")}
                    >
                      <div className="source-icon-badge">🌐</div>
                      <div>
                        <h4>Article / Website</h4>
                        <p>Paste webpage or documentation link</p>
                      </div>
                    </button>

                    <button
                      type="button"
                      className="source-card-btn web"
                      onClick={() => handleSelectSource("web")}
                    >
                      <div className="source-icon-badge">🔍</div>
                      <div>
                        <h4>Search the Web</h4>
                        <p>Research any topic from scratch</p>
                      </div>
                    </button>
                  </div>
                )}

                {/* PDF File Picker Box */}
                {msg.showPdfUpload && !isProcessing && (
                  <div
                    className="pdf-upload-box"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <input
                      type="file"
                      ref={fileInputRef}
                      accept="application/pdf"
                      style={{ display: "none" }}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handlePdfUpload(file);
                      }}
                    />
                    <div style={{ fontSize: "2rem", marginBottom: "8px" }}>📂</div>
                    <p style={{ fontWeight: 600, color: "#fff" }}>Click to select a PDF file</p>
                    <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "4px" }}>
                      Supports text-based PDF documents up to 50MB
                    </p>
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Processing / Progress Status Banner */}
          {isProcessing && (
            <div className="processing-indicator">
              <div className="spinner"></div>
              <span>{statusMessage}</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <form className="chat-input-bar" onSubmit={handleSend}>
          <input
            type="text"
            className="chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isProcessing}
            placeholder={
              botState === "waiting_for_youtube_url"
                ? "Paste YouTube URL (e.g. https://www.youtube.com/watch?v=...)"
                : botState === "waiting_for_article_url"
                ? "Paste article URL (e.g. https://...)"
                : botState === "waiting_for_web_query"
                ? "Enter learning topic (e.g. Retrieval Augmented Generation)"
                : "Type what you'd like to learn or paste a URL..."
            }
          />
          <button
            type="submit"
            className="btn btn-primary"
            disabled={!input.trim() || isProcessing}
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}

import React, { useState, useEffect } from "react";
import OnboardingChatbot from "./components/OnboardingChatbot";
import LearningWorkspace from "./components/LearningWorkspace";

function App() {
  const [currentSource, setCurrentSource] = useState(() => {
    try {
      const saved = sessionStorage.getItem("ai_learning_source");
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const handleSourceReady = (sourceData) => {
    setCurrentSource(sourceData);
    try {
      sessionStorage.setItem("ai_learning_source", JSON.stringify(sourceData));
    } catch {
      // sessionStorage unavailable
    }
  };

  const handleBackToOnboarding = () => {
    setCurrentSource(null);
    try {
      sessionStorage.removeItem("ai_learning_source");
    } catch {
      // ignore
    }
  };

  return (
    <div className="app-container">
      {/* Top Navbar */}
      <header className="app-header">
        <div className="brand-section" onClick={handleBackToOnboarding}>
          <div className="brand-logo-icon">
            <span style={{ fontSize: "1.1rem" }}>⚡</span>
          </div>
          <div>
            <span className="brand-title">AI Learning Copilot</span>
          </div>
          <span className="brand-badge">BGE-M3 • QDRANT • LLAMA 3.1</span>
        </div>

        <div className="header-actions">
          {currentSource && (
            <button
              type="button"
              className="btn btn-primary"
              style={{ fontSize: "0.8rem", padding: "6px 12px" }}
              onClick={handleBackToOnboarding}
            >
              + New Source
            </button>
          )}
        </div>
      </header>

      {/* Main Screen: Onboarding Chatbot vs Learning Workspace */}
      <main style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        {currentSource ? (
          <LearningWorkspace
            source={currentSource}
            onBackToOnboarding={handleBackToOnboarding}
          />
        ) : (
          <OnboardingChatbot onSourceReady={handleSourceReady} />
        )}
      </main>
    </div>
  );
}

export default App;

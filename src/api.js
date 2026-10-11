// Centralized API client for AI Learning Copilot backend

const API_BASE = "";

/**
 * Handle API responses and uniform error handling
 */
const handleResponse = async (res) => {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || `Request failed with status ${res.status}`);
  }
  return data;
};

// ==========================================
// 1. ONBOARDING CHATBOT API
// ==========================================
export const chatWithInputbot = async (message, state = {}) => {
  const res = await fetch(`${API_BASE}/api/inputbot/inputbot`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, state }),
  });
  return handleResponse(res);
};

// ==========================================
// 2. YOUTUBE FLOW API
// ==========================================
export const fetchYouTubeTranscript = async (url) => {
  const res = await fetch(`${API_BASE}/api/youtube/transcript`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  return handleResponse(res);
};

export const indexYouTubeRAG = async (url, sourceId) => {
  const res = await fetch(`${API_BASE}/api/youtube/rag`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, sourceId }),
  });
  return handleResponse(res);
};

export const queryYouTubeRAG = async ({ url, sourceId, userquery, language = "English" }) => {
  const res = await fetch(`${API_BASE}/api/youtube/userqueryembedding`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, sourceId, userquery, language, selectedLanguage: language }),
  });
  return handleResponse(res);
};

export const fetchYouTubeNotes = async ({ url, sourceId, transcript, language = "English", forceRegenerate = false }) => {
  const res = await fetch(`${API_BASE}/api/youtube/detailednotesSummary`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, sourceId, transcript, language, selectedLanguage: language, forceRegenerate }),
  });
  return handleResponse(res);
};

// ==========================================
// 3. PDF FLOW API
// ==========================================
export const uploadPdfDocument = async (file) => {
  const formData = new FormData();
  formData.append("pdf", file);

  const res = await fetch(`${API_BASE}/api/pdf/upload-pdf`, {
    method: "POST",
    body: formData,
  });
  return handleResponse(res);
};

export const indexPdfRAG = async (documentId) => {
  const res = await fetch(`${API_BASE}/api/pdf/rag`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ documentId }),
  });
  return handleResponse(res);
};

export const queryPdfRAG = async ({ documentId, userquery, language = "English" }) => {
  const res = await fetch(`${API_BASE}/api/pdf/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ documentId, userquery, language, selectedLanguage: language }),
  });
  return handleResponse(res);
};

export const fetchPdfNotes = async ({ documentId, text, language = "English" }) => {
  const res = await fetch(`${API_BASE}/api/pdf/detailednotesSummary`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ documentId, text, language, selectedLanguage: language }),
  });
  return handleResponse(res);
};

// ==========================================
// 4. ARTICLE FLOW API
// ==========================================
export const extractArticle = async (url) => {
  const res = await fetch(`${API_BASE}/api/article/extract`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  return handleResponse(res);
};

export const indexArticleRAG = async (url, sourceId) => {
  const res = await fetch(`${API_BASE}/api/article/rag`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, sourceId }),
  });
  return handleResponse(res);
};

export const queryArticleRAG = async ({ url, sourceId, userquery, language = "English" }) => {
  const res = await fetch(`${API_BASE}/api/article/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, sourceId, articleId: sourceId, userquery, language, selectedLanguage: language }),
  });
  return handleResponse(res);
};

export const fetchArticleNotes = async ({ url, sourceId, language = "English" }) => {
  const res = await fetch(`${API_BASE}/api/article/detailednotesSummary`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, sourceId, articleId: sourceId, language, selectedLanguage: language }),
  });
  return handleResponse(res);
};

// ==========================================
// 5. WEB RESEARCH FLOW API
// ==========================================
export const searchAndIndexWeb = async (query) => {
  const res = await fetch(`${API_BASE}/api/web-research/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  return handleResponse(res);
};

export const queryWebResearch = async ({ sourceId, userquery, language = "English" }) => {
  const res = await fetch(`${API_BASE}/api/web-research/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sourceId, userquery, language, selectedLanguage: language }),
  });
  return handleResponse(res);
};

export const fetchWebResearchNotes = async ({ sourceId, language = "English" }) => {
  const res = await fetch(`${API_BASE}/api/web-research/detailednotesSummary`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sourceId, language, selectedLanguage: language }),
  });
  return handleResponse(res);
};

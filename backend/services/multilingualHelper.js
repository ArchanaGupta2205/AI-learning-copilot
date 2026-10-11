export const SUPPORTED_LANGUAGES = ["English", "Hindi", "Hinglish", "Spanish", "French"];

/**
 * Validates and normalizes the requested language
 * @param {string} lang 
 * @returns {string|null} Normalized language name or null if unsupported
 */
export const normalizeLanguage = (lang) => {
  if (!lang || typeof lang !== "string") return "English";
  const cleaned = lang.trim().toLowerCase();
  if (cleaned === "hindi") return "Hindi";
  if (cleaned === "hinglish") return "Hinglish";
  if (cleaned === "spanish") return "Spanish";
  if (cleaned === "french") return "French";
  if (cleaned === "english") return "English";
  return null;
};

/**
 * Localized message when no relevant context or low similarity is found
 * @param {string} language 
 * @returns {string}
 */
export const getNoInfoMessage = (language) => {
  switch (language) {
    case "Hindi":
      return "उपलब्ध शिक्षण सामग्री में इस प्रश्न का उत्तर देने के लिए पर्याप्त प्रासंगिक जानकारी नहीं मिली।";
    case "Hinglish":
      return "Provided learning material me is question ka answer dene ke liye sufficient information nahi mili.";
    case "Spanish":
      return "No pude encontrar suficiente información relevante en el material de aprendizaje proporcionado para responder a esta pregunta.";
    case "French":
      return "Je n'ai pas trouvé suffisamment d'informations pertinentes dans le matériel d'apprentissage fourni pour répondre à cette question.";
    case "English":
    default:
      return "I couldn't find enough relevant information in the provided learning material to answer this question.";
  }
};

/**
 * Language guidance rules for Summary / Detailed Notes generation
 * @param {string} language 
 * @returns {string}
 */
export const getLanguageInstructionForNotes = (language) => {
  switch (language) {
    case "Hindi":
      return `- Generate all explanations, overviews, takeaways, and topics naturally in Hindi.
- Preserve important technical terms (such as RAG, embeddings, vector database, Qdrant, API, LLM, etc.) in English or standard terminology. Do not translate technical names unnecessarily.
- Example: "RAG (Retrieval-Augmented Generation) ek technique hai jisme language model answer generate karne se pehle external knowledge base se relevant information retrieve karta hai."`;
    case "Hinglish":
      return `- Write all explanations and notes in natural, conversational Hinglish (Hindi written in Roman/English alphabet mixed with English).
- Preserve all technical terms, code keywords, and acronyms intact.
- Example: "RAG ek powerful technique hai jisme language model answer generate karne se pehle external knowledge base se data retrieve karta hai."`;
    case "Spanish":
      return `- Write all explanations, overviews, and topics naturally in Spanish.
- Preserve standard English technical terms, code concepts, and acronyms.`;
    case "French":
      return `- Write all explanations, overviews, and topics naturally in French.
- Preserve standard English technical terms, code concepts, and acronyms.`;
    case "English":
    default:
      return `- Write all explanations, overviews, and topics clearly in structured English.`;
  }
};

/**
 * Language guidance rules for RAG Q&A generation
 * @param {string} language 
 * @returns {string}
 */
export const getLanguageInstructionForRAG = (language) => {
  switch (language) {
    case "Hindi":
      return `Respond naturally and accurately in Hindi. Preserve English technical terms (e.g., RAG, embeddings, vector database, Qdrant, API, LLM) in English script or familiar phrasing. Do not translate technical names unnecessarily.`;
    case "Hinglish":
      return `Respond in natural, conversational Hinglish (Hindi written in Roman/English alphabet mixed with English). Preserve all English technical terminology and keywords intact.`;
    case "Spanish":
      return `Respond naturally and accurately in Spanish. Preserve industry-standard technical terms and code concepts.`;
    case "French":
      return `Respond naturally and accurately in French. Preserve industry-standard technical terms and code concepts.`;
    case "English":
    default:
      return `Respond clearly and educationally in English.`;
  }
};

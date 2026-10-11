/* import { HfInference } from "@huggingface/inference";
import dotenv from "dotenv";

dotenv.config();

const hf = new HfInference(process.env.HUGGINGFACEHUB_API_TOKEN);

/**
 * Invokes the Llama 3.1 8B Instruct model using Hugging Face Inference API
 * @param {string} prompt - The user prompt or question
 * @param {object} options - Optional config (maxTokens, systemPrompt, etc.)
 * @returns {Promise<string>} The generated response text
 
export const invokeLLM = async (prompt, options = {}) => {
  try {
    const messages = [];

    if (options.systemPrompt) {
      messages.push({ role: "system", content: options.systemPrompt });
    }

    messages.push({ role: "user", content: prompt });

    const response = await hf.chatCompletion({
      model: "meta-llama/Llama-3.1-8B-Instruct",
      messages,
      max_tokens: options.maxTokens || 100,
      temperature: options.temperature ?? 0.7,
    });

    return response.choices[0].message.content;
  } catch (error) {
    console.error("Error invoking LLM:", error.message);
    throw error;
  }
}; */


import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const PRIMARY_MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
const FALLBACK_MODEL = "gemini-3.5-flash";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const invokeLLM = async (prompt, options = {}) => {
  const maxRetries = options.retries ?? 3;
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    // If last attempt failed with 503, try fallback model
    const modelToUse = attempt === maxRetries ? FALLBACK_MODEL : (options.model || PRIMARY_MODEL);

    try {
      const config = {
        systemInstruction: options.systemPrompt || undefined,
        maxOutputTokens: options.maxTokens || 4096,
        temperature: options.temperature ?? 0.7,
      };

      if (options.schema) {
        config.responseMimeType = "application/json";
        config.responseSchema = options.schema;
      } else if (options.jsonMode) {
        config.responseMimeType = "application/json";
      }

      const response = await ai.models.generateContent({
        model: modelToUse,
        contents: prompt,
        config,
      });

      return response.text || "";
    } catch (error) {
      lastError = error;
      const errorMsg = error.message || "";
      const isUnavailable = error.status === 503 || errorMsg.includes("503") || errorMsg.includes("UNAVAILABLE") || errorMsg.includes("high demand");
      const isRateLimited = error.status === 429 || errorMsg.includes("429") || errorMsg.includes("RESOURCE_EXHAUSTED");

      if ((isUnavailable || isRateLimited) && attempt < maxRetries) {
        const backoffMs = attempt * 1500;
        console.warn(`[Gemini LLM] Attempt ${attempt} failed with ${error.status || "503/429"} (${modelToUse}). Retrying in ${backoffMs}ms...`);
        await wait(backoffMs);
        continue;
      }

      console.error(`Error invoking Gemini LLM on attempt ${attempt} (${modelToUse}):`, error.message);
      if (attempt === maxRetries) throw error;
    }
  }

  throw lastError;
};


/**
 * Uses the LLM to understand a user's question or topic and generate an optimized web search query
 * @param {string} userQuestion - The user's input question or text query
 * @returns {Promise<string>} An optimized search query for search engines like Tavily
 */
export const optimizeSearchQuery = async (userQuestion) => {
  const prompt = `You are an AI research assistant. Your task is to understand the user's question or topic and formulate an optimized, concise web search query to find high-quality educational or news articles.

Return ONLY the search query keywords. Do not include quotes, conversational filler, greetings, or explanations.

User input: "${userQuestion}"

Optimized search query:`;

  try {
    const result = await invokeLLM(prompt, {
      maxTokens: 50,
      temperature: 0.3,
    });

    const cleaned = result
      .replace(/["\n\r`]/g, "")
      .trim();

    return cleaned || userQuestion;
  } catch (error) {
    console.warn("LLM search query optimization failed, falling back to original query:", error.message);
    return userQuestion;
  }
};

// Test invocation when running this file directly: `node agents/llm.js`
if (process.argv[1]?.endsWith("llm.js")) {
  console.log("Testing LLM with prompt: 'Hello, how are you?'");
  invokeLLM("Hello, how are you?")
    .then((reply) => console.log("\nLLM Reply:\n", reply))
    .catch((err) => console.error("Error:", err));
}


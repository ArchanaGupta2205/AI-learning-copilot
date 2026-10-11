import { TavilySearch } from "@langchain/tavily";
import dotenv from "dotenv";
import { optimizeSearchQuery } from "../agents/llm.js";
import {
  scrapeAndSaveArticle,
  getArticleDetailednotesSummary,
} from "./articlecontroller.js";
import {
  indexArticleToQdrant,
  queryArticleAndAnswer,
} from "../RAG/article_pipeline.js";
import { normalizeLanguage, SUPPORTED_LANGUAGES } from "../services/multilingualHelper.js";

dotenv.config();

const getTavilyInstance = (maxResults = 5) => {
  const tavilyApiKey = (
    process.env.TAVILY_API_KEY ||
    process.env["AI Learning copilot"] ||
    ""
  )
    .trim()
    .replace(/^["']|["']$/g, "");

  return new TavilySearch({
    maxResults,
    topic: "general",
    ...(tavilyApiKey ? { tavilyApiKey } : {}),
  });
};

/**
 * Reusable function to execute a Tavily search query and return parsed results and URLs
 * @param {string} query - The search query
 * @param {number} maxResults - Max number of results to fetch
 * @returns {Promise<{ query: string, results: Array, urls: string[] }>}
 */
export const searchWebTavily = async (query, maxResults = 5) => {
  if (!query) {
    throw new Error("Query is required for Tavily web search");
  }

  console.log(`[Tavily] Executing search for: "${query}"`);

  const tavily = getTavilyInstance(maxResults);
  const raw = await tavily.invoke({
    query,
    maxResults,
  });

  let items = [];

  if (Array.isArray(raw)) {
    items = raw;
  } else if (raw && Array.isArray(raw.results)) {
    items = raw.results;
  } else if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      items = Array.isArray(parsed) ? parsed : parsed.results || [];
    } catch {
      items = [];
    }
  }

  // Extract valid HTTP/HTTPS URLs
  const urls = items
    .map((item) => (typeof item === "string" ? item : item?.url))
    .filter((url) => typeof url === "string" && /^https?:\/\//i.test(url));

  console.log(`[Tavily] Found ${urls.length} relevant URLs`);

  return {
    query,
    results: items,
    urls,
  };
};

/**
 * Full Web Research Pipeline: Topic -> LLM Optimization -> Tavily -> Cheerio Scrape -> MongoDB -> Qdrant Index -> Workspace Metadata
 */
export const executeWebResearch = async (req, res) => {
  try {
    const topic = (req.body?.query || req.body?.topic || req.query?.query || "").trim();

    if (!topic) {
      return res.status(400).json({
        success: false,
        message: "Search query or topic is required for web research",
      });
    }

    console.log(`[Web Research] Starting research on topic: "${topic}"`);

    // 1. Optimize query for search engine
    const optimizedQuery = await optimizeSearchQuery(topic);
    console.log(`[Web Research] Optimized query: "${optimizedQuery}"`);

    // 2. Tavily web search
    const { urls, results } = await searchWebTavily(optimizedQuery, 5);

    if (!urls || urls.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No relevant web resources found for this topic",
      });
    }

    // 3. Cheerio extract readable content with fallback across candidate URLs
    let article = null;
    let selectedUrl = null;

    for (const candidateUrl of urls) {
      try {
        console.log(`[Web Research] Scraping candidate URL: ${candidateUrl}`);
        article = await scrapeAndSaveArticle(candidateUrl);
        selectedUrl = candidateUrl;
        break;
      } catch (err) {
        console.warn(`[Web Research] Could not scrape ${candidateUrl}:`, err.message);
      }
    }

    if (!article) {
      return res.status(500).json({
        success: false,
        message: "Could not extract readable article content from any search results",
      });
    }

    // 4. Index into Qdrant for RAG
    const ragResult = await indexArticleToQdrant(article);

    // 5. Return Learning Workspace metadata
    return res.json({
      success: true,
      message: "Web research completed and indexed into learning workspace",
      sourceType: "web",
      sourceId: article._id,
      title: article.title || topic,
      url: selectedUrl,
      topic,
      searchQuery: optimizedQuery,
      status: "ready",
      chunksStored: ragResult.chunksStored,
      features: ["summary", "notes", "qa"],
      searchResultsCount: urls.length,
    });
  } catch (error) {
    console.error("[Web Research Pipeline Error]:", error);
    return res.status(500).json({
      success: false,
      message: "Web research failed",
      error: error.message,
    });
  }
};

/**
 * Question Answering for Web Researched Content
 */
export const queryWebResearch = async (req, res) => {
  try {
    const userquery = (
      req.body?.userquery ||
      req.body?.query ||
      req.query?.userquery ||
      req.query?.query ||
      ""
    ).trim();

    const source =
      req.body?.sourceId ||
      req.body?.articleId ||
      req.body?.url ||
      req.query?.sourceId ||
      req.query?.articleId ||
      req.query?.url;

    const rawLanguage =
      req.body?.language ||
      req.body?.selectedLanguage ||
      req.query?.language ||
      req.query?.selectedLanguage ||
      "English";
    const selectedLanguage = normalizeLanguage(rawLanguage);

    if (!selectedLanguage) {
      return res.status(400).json({
        success: false,
        message: `Unsupported language: "${rawLanguage}". Supported options: ${SUPPORTED_LANGUAGES.join(", ")}`,
        supportedLanguages: SUPPORTED_LANGUAGES,
      });
    }

    if (!userquery || !source) {
      return res.status(400).json({
        success: false,
        message: "userquery and sourceId/url are required",
      });
    }

    const result = await queryArticleAndAnswer(userquery, source, selectedLanguage);

    return res.json({
      success: true,
      question: userquery,
      language: selectedLanguage,
      answer: result.answer,
      sources: result.sources,
      debug: result.debug,
    });
  } catch (error) {
    console.error("[Web Research Query Error]:", error);
    return res.status(500).json({
      success: false,
      message: "Error querying web research content",
      error: error.message,
    });
  }
};

/**
 * Raw search endpoint (Tavily search only)
 */
export const webResearch = async (req, res) => {
  try {
    const query = req.body?.query || req.query?.query;

    if (!query) {
      return res.status(400).json({
        success: false,
        message: "Query is required",
      });
    }

    const { results, urls } = await searchWebTavily(query);

    return res.json({
      success: true,
      query,
      results,
      urls,
    });
  } catch (error) {
    console.error("TAVILY ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Web research failed",
      error: error.message,
    });
  }
};
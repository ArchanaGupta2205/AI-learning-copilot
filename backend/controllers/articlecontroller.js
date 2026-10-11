import axios from "axios";
import * as cheerio from "cheerio";
import { articleDocument } from "../models/article_model.js";
import { searchWebTavily } from "./webResearchController.js";
import { optimizeSearchQuery, invokeLLM } from "../agents/llm.js";
import {
  indexArticleToQdrant,
  queryArticleAndAnswer,
} from "../RAG/article_pipeline.js";
import {
  normalizeLanguage,
  getLanguageInstructionForNotes,
  SUPPORTED_LANGUAGES,
} from "../services/multilingualHelper.js";

// ======================================================
// 1. HELPER: SCRAPE WEBPAGE USING CHEERIO & SAVE TO MONGO
// ======================================================

export const scrapeAndSaveArticle = async (url) => {
  if (!url) {
    throw new Error("Article URL is required");
  }

  // Check if article already exists
  const existingArticle = await articleDocument.findOne({ url });
  if (existingArticle && existingArticle.fullText) {
    console.log("Article already exists in DB:", existingArticle.title);
    return existingArticle;
  }

  // 1. Fetch webpage
  const response = await axios.get(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/154.0.0.0 Safari/537.36",
    },
    timeout: 15000,
  });

  // 2. Load HTML into Cheerio
  const $ = cheerio.load(response.data);

  // 3. Remove unwanted elements
  $("script, style, noscript, nav, footer, header").remove();

  // 4. Get title
  const title =
    $("article h1").first().text().trim() ||
    $("h1").first().text().trim() ||
    $("title").text().trim() ||
    "Untitled Article";

  // 5. Extract article content
  let fullText = "";

  $("article p, article h1, article h2, article h3, article li").each(
    (_, element) => {
      const text = $(element).text().trim();
      if (text) {
        fullText += text + "\n\n";
      }
    }
  );

  // 6. If <article> doesn't contain content, try <main>
  if (!fullText.trim()) {
    $("main p, main h1, main h2, main h3, main li").each((_, element) => {
      const text = $(element).text().trim();
      if (text) {
        fullText += text + "\n\n";
      }
    });
  }

  // 7. Final fallback
  if (!fullText.trim()) {
    fullText = $("body").text().replace(/\s+/g, " ").trim();
  }

  if (!fullText.trim()) {
    throw new Error("Could not extract readable content from this website");
  }

  // 8. Save in MongoDB
  const savedArticle = await articleDocument.create({
    url,
    title,
    fullText,
  });

  console.log("Article saved in MongoDB:", savedArticle._id);
  return savedArticle;
};

// ======================================================
// 2. UNIFIED CONTROLLER: CONNECTS CHEERIO, TAVILY & RAG
// ======================================================

export const processArticle = async (req, res) => {
  try {
    const input = (
      req.body?.input ||
      req.body?.url ||
      req.body?.query ||
      ""
    ).trim();

    if (!input) {
      return res.status(400).json({
        success: false,
        message: "URL or query question is required",
      });
    }

    // Check if input is a URL
    const isUrl = input.startsWith("http://") || input.startsWith("https://");

    if (isUrl) {
      // --------------------------------------------------
      // PATH 1: INPUT IS URL -> CHEERIO -> RAG
      // --------------------------------------------------
      console.log("Input is URL:", input);

      // Step 1: Cheerio extracts content and saves in MongoDB
      const article = await scrapeAndSaveArticle(input);

      // Step 2: RAG chunks, embeds, and stores in Qdrant
      const ragResult = await indexArticleToQdrant(article);

      return res.json({
        success: true,
        type: "url",
        message: "Article extracted via Cheerio and indexed in RAG successfully",
        articleId: article._id,
        title: article.title,
        url: article.url,
        chunksStored: ragResult.chunksStored,
      });
    } else {
      // --------------------------------------------------
      // PATH 2: INPUT IS QUERY -> LLM -> TAVILY -> CHEERIO -> RAG
      // --------------------------------------------------
      console.log("Input is Question / Query:", input);

      // Step 1: LLM understands the query & creates search keywords
      const searchQuery = await optimizeSearchQuery(input);
      console.log("Optimized search query:", searchQuery);

      // Step 2: Tavily search finds top relevant URLs
      const { urls } = await searchWebTavily(searchQuery);

      if (!urls || urls.length === 0) {
        return res.status(404).json({
          success: false,
          message: "No articles found via Tavily search",
        });
      }

      console.log("Tavily found URLs:", urls);

      // Step 3: Cheerio extracts content from top URL (with fallback to next if one fails)
      let article = null;
      let usedUrl = null;

      for (const candidateUrl of urls) {
        try {
          console.log("Scraping with Cheerio:", candidateUrl);
          article = await scrapeAndSaveArticle(candidateUrl);
          usedUrl = candidateUrl;
          break;
        } catch (err) {
          console.log(`Failed to scrape ${candidateUrl}:`, err.message);
        }
      }

      if (!article) {
        return res.status(500).json({
          success: false,
          message: "Could not extract readable content from any search results",
        });
      }

      // Step 4: RAG chunks, embeds, and stores in Qdrant
      console.log("Indexing article into Qdrant:", article.title);
      const ragResult = await indexArticleToQdrant(article);

      // Step 5: Answer user's question using RAG
      console.log("Answering user question using RAG...");
      const ragAnswer = await queryArticleAndAnswer(input, article);

      return res.json({
        success: true,
        type: "query",
        question: input,
        searchQuery,
        sourceUrl: usedUrl,
        title: article.title,
        articleId: article._id,
        chunksStored: ragResult.chunksStored,
        answer: ragAnswer.answer,
        sources: ragAnswer.sources,
      });
    }
  } catch (error) {
    console.error("PROCESS ARTICLE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Processing failed",
      error: error.message,
    });
  }
};

// ======================================================
// 3. ORIGINAL UPLOAD CONTROLLER (Backward Compatibility)
// ======================================================

export const uploadArticle = async (req, res) => {
  try {
    const url = req.body?.url || req.query?.url;

    if (!url) {
      return res.status(400).json({
        success: false,
        message: "Article/website URL is required",
      });
    }

    const article = await scrapeAndSaveArticle(url);

    return res.json({
      success: true,
      message: "Article extracted successfully",
      articleId: article._id,
      sourceId: article._id,
      sourceType: "article",
      title: article.title,
      url: article.url,
      textLength: article.fullText?.length,
      status: "ready",
      features: ["summary", "notes", "qa"],
    });
  } catch (error) {
    console.error("ARTICLE EXTRACTION ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to extract article",
      error: error.message,
    });
  }
};

export const getArticleDetailednotesSummary = async (req, res) => {
  try {
    const articleId = req.body?.articleId || req.body?.sourceId || req.query?.articleId || req.query?.sourceId;
    const url = req.body?.url || req.query?.url;
    let text = req.body?.text || req.query?.text;
    let articleDoc = null;

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

    if (articleId || url) {
      articleDoc = articleId
        ? await articleDocument.findById(articleId)
        : await articleDocument.findOne({ url });

      // Check language cache
      if (articleDoc?.detailednotesSummaryByLang?.[selectedLanguage]) {
        return res.json({
          success: true,
          cached: true,
          language: selectedLanguage,
          detailednotesSummary: articleDoc.detailednotesSummaryByLang[selectedLanguage],
        });
      }

      // Legacy English cache fallback
      if (selectedLanguage === "English" && articleDoc?.detailednotesSummary) {
        return res.json({
          success: true,
          cached: true,
          language: "English",
          detailednotesSummary: articleDoc.detailednotesSummary,
        });
      }

      if (!text && articleDoc) {
        text = articleDoc.fullText;
      }
    }

    if (!text) {
      return res.status(400).json({
        success: false,
        message: "articleId, url, or text is required",
      });
    }

    const languageInstructions = getLanguageInstructionForNotes(selectedLanguage);

    const prompt = `You are an AI research assistant.
Provide a clear, well-structured, and comprehensive summary of this article in ${selectedLanguage}.
Highlight key arguments, insights, and important takeaways with clean headings (##) and bullet points.
${languageInstructions}

Article Content:
${text.substring(0, 15000)}`;

    const detailednotesSummary = await invokeLLM(prompt, { maxTokens: 4000 });

    if (articleDoc) {
      articleDoc.detailednotesSummaryByLang = articleDoc.detailednotesSummaryByLang || {};
      articleDoc.detailednotesSummaryByLang[selectedLanguage] = detailednotesSummary;
      if (selectedLanguage === "English") {
        articleDoc.detailednotesSummary = detailednotesSummary;
      }
      articleDoc.markModified("detailednotesSummaryByLang");
      await articleDoc.save().catch((err) => console.error("Could not cache article notes:", err.message));
    }

    return res.json({
      success: true,
      language: selectedLanguage,
      detailednotesSummary: detailednotesSummary,
    });
  } catch (error) {
    console.error("ARTICLE NOTES ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to generate notes for article",
      error: error.message,
    });
  }
};
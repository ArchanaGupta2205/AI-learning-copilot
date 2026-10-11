import express from "express";
import {
  processArticle,
  uploadArticle,
  getArticleDetailednotesSummary,
} from "../controllers/articlecontroller.js";
import {
  articleRag,
  articleUserQuery,
} from "../RAG/article_pipeline.js";

const router = express.Router();

// Unified endpoint (handles both direct URL and query question: Tavily -> Cheerio -> RAG)
router.post("/process", processArticle);

// Individual pipeline endpoints
router.post("/extract", uploadArticle);
router.post("/rag", articleRag);
router.get("/rag", articleRag);
router.post("/query", articleUserQuery);
router.get("/query", articleUserQuery);

// Summary & Detailed Notes
router.post("/detailednotesSummary", getArticleDetailednotesSummary);
router.get("/detailednotesSummary", getArticleDetailednotesSummary);

export default router;
import express from "express";
import {
  executeWebResearch,
  queryWebResearch,
  webResearch,
} from "../controllers/webResearchController.js";
import { getArticleDetailednotesSummary } from "../controllers/articlecontroller.js";

const router = express.Router();

// Full web research flow: Topic -> Tavily -> Cheerio Scrape -> MongoDB -> Qdrant -> Workspace
router.post("/search", executeWebResearch);
router.get("/search", executeWebResearch);

// Q&A over the researched web content
router.post("/query", queryWebResearch);
router.get("/query", queryWebResearch);

// Detailed notes & summary for researched web content
router.post("/detailednotesSummary", getArticleDetailednotesSummary);
router.get("/detailednotesSummary", getArticleDetailednotesSummary);

// Raw Tavily search results (optional utility)
router.post("/raw-search", webResearch);
router.get("/raw-search", webResearch);

export default router;

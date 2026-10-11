import express from "express";
import { getTranscript } from "../controllers/youtubecontroller.js";
import { getDetailednotesSummaryfromLLM } from "../controllers/youtubecontroller.js";
import { rag } from "../RAG/pipeline.js";
import { userqueryembedding } from "../RAG/pipeline.js";
const router = express.Router();

// Route to get transcript
router.post("/transcript", getTranscript);
router.get("/transcript", getTranscript);
router.post("/detailednotesSummary", getDetailednotesSummaryfromLLM);
router.get("/detailednotesSummary", getDetailednotesSummaryfromLLM);

router.post("/rag", rag);
router.get("/rag", rag);
router.post("/userqueryembedding", userqueryembedding);
router.get("/userqueryembedding", userqueryembedding);
router.post("/query", userqueryembedding);

export default router;

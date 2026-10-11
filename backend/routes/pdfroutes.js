import express from "express";
import upload from "../middleware/upload.js";
import { uploadPDF, getPdfDetailednotesSummary } from "../controllers/pdfcontroller.js";
import { pdfRag, pdfUserQuery } from "../RAG/pdf_pipeline.js";

const router = express.Router();

// PDF Upload & Text Extraction
router.post(
  "/upload-pdf",
  upload.single("pdf"),
  uploadPDF
);

// PDF RAG Pipeline (Chunking -> Embedding -> Qdrant)
router.post("/rag", pdfRag);
router.get("/rag", pdfRag);

// PDF Question Answering
router.post("/query", pdfUserQuery);
router.get("/query", pdfUserQuery);

// PDF Summary & Detailed Notes
router.post("/detailednotesSummary", getPdfDetailednotesSummary);
router.get("/detailednotesSummary", getPdfDetailednotesSummary);

export default router;
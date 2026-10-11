import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { HfInference } from "@huggingface/inference";
import { QdrantClient } from "@qdrant/js-client-rest";
import { randomUUID } from "crypto";
import mongoose from "mongoose";
import { pdfDocument } from "../models/pdfparse.js";
import { invokeLLM } from "../agents/llm.js";
import { memoryPdfStore } from "../controllers/pdfcontroller.js";
import {
  normalizeLanguage,
  getNoInfoMessage,
  getLanguageInstructionForRAG,
  SUPPORTED_LANGUAGES,
} from "../services/multilingualHelper.js";

import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

/* const hf = new HfInference(
  process.env.HUGGINGFACEHUB_API_TOKEN || process.env.HF_TOKEN
); */

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const getQdrantClient = () => {
  return new QdrantClient({
    url: process.env.qdrant_URL,
    apiKey: process.env.api_key_Qdrant,
  });
};

const COLLECTION_NAME = "pdf_chunks_gemini";

export const pdfRag = async (req, res) => {
  try {
    const documentId = req.body?.documentId || req.query?.documentId;

    if (!documentId) {
      return res.status(400).json({
        success: false,
        message: "documentId is required",
      });
    }

    // 1. Get PDF from MongoDB or in-memory fallback
    let pdf = null;
    if (mongoose.connection.readyState === 1) {
      try {
        pdf = await pdfDocument.findById(documentId);
      } catch (err) {
        console.warn("MongoDB read failed in pdfRag, using in-memory store:", err.message);
      }
    }
    if (!pdf) {
      pdf = memoryPdfStore.get(documentId.toString());
    }

    if (!pdf || !pdf.fullText) {
      return res.status(404).json({
        success: false,
        message: "PDF document not found in database or memory store",
      });
    }

    const fullText = pdf.fullText;

    // 2. Chunk PDF
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });

    const chunks = await splitter.splitText(fullText);
    console.log(`[PDF RAG] Created ${chunks.length} PDF chunks`);

    if (chunks.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Could not create chunks from PDF content",
      });
    }

    // 3. Create embeddings
    const points = [];

    for (let i = 0; i < chunks.length; i++) {
      /* const embedding = await hf.featureExtraction({
        model: "BAAI/bge-m3",
        inputs: chunks[i],
        provider: "hf-inference",
      }); */

      const response = await ai.models.embedContent({
        model: "gemini-embedding-001",
        contents: chunks[i],
        config: { outputDimensionality: 768 },
      });
      const embedding = response.embeddings[0].values;

      points.push({
        id: randomUUID(),
        vector: embedding,
        payload: {
          documentId: documentId.toString(),
          fileName: pdf.fileName,
          chunkIndex: i,
          text: chunks[i],
        },
      });
    }

    // 4. Qdrant Client
    const client = getQdrantClient();

    // 5. Create collection if needed
    const collections = await client.getCollections();
    const exists = collections.collections.some(
      (collection) => collection.name === COLLECTION_NAME
    );

    if (!exists) {
      await client.createCollection(COLLECTION_NAME, {
        vectors: {
          size: points[0].vector.length || 1024,
          distance: "Cosine",
        },
      });
      console.log(`[PDF RAG] Collection "${COLLECTION_NAME}" created`);
    }

    // 6. Create payload index for documentId (required for strict source filtering)
    try {
      await client.createPayloadIndex(COLLECTION_NAME, {
        field_name: "documentId",
        field_schema: "keyword",
        wait: true,
      });
    } catch {
      // Index already exists
    }

    // 7. Store vectors
    await client.upsert(COLLECTION_NAME, {
      wait: true,
      points,
    });

    console.log(`[PDF RAG] ${points.length} chunks stored in Qdrant for documentId ${documentId}`);

    return res.json({
      success: true,
      message: "PDF chunks stored in Qdrant successfully",
      documentId,
      sourceId: documentId,
      sourceType: "pdf",
      title: pdf.fileName,
      status: "ready",
      chunksStored: points.length,
      features: ["summary", "notes", "qa"],
    });
  } catch (error) {
    console.error("[PDF RAG Error]:", error);

    return res.status(500).json({
      success: false,
      message: "PDF RAG pipeline failed",
      error: error.message,
    });
  }
};

// Multilingual PDF Retrieval & Q&A
export const pdfUserQuery = async (req, res) => {
  try {
    const documentId = req.body?.documentId || req.query?.documentId;
    const userquery = (
      req.body?.userquery ||
      req.body?.query ||
      req.query?.userquery ||
      req.query?.query ||
      ""
    ).trim();

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

    if (!documentId) {
      return res.status(400).json({
        success: false,
        message: "documentId is required",
      });
    }

    if (!userquery) {
      return res.status(400).json({
        success: false,
        message: "userquery is required and cannot be empty",
      });
    }

    /* const queryEmbedding = await hf.featureExtraction({
      model: "BAAI/bge-m3",
      inputs: userquery,
      provider: "hf-inference",
    }); */

    const queryEmbedResponse = await ai.models.embedContent({
      model: "gemini-embedding-001",
      contents: userquery,
      config: { outputDimensionality: 768 },
    });
    const queryEmbedding = queryEmbedResponse.embeddings[0].values;

    // 2. Qdrant Client
    const client = getQdrantClient();

    // 3. Search ONLY this PDF using documentId filter (Strict Source Isolation)
    const results = await client.query(COLLECTION_NAME, {
      query: queryEmbedding,
      with_payload: true,
      limit: 5,
      filter: {
        must: [
          {
            key: "documentId",
            match: {
              value: documentId.toString(),
            },
          },
        ],
      },
    });

    const points = results.points || [];
    const SIMILARITY_THRESHOLD = 0.35;
    const topScore = points[0]?.score || 0;

    // 4. Low-similarity / No retrieved chunks check
    if (points.length === 0 || topScore < SIMILARITY_THRESHOLD) {
      const fallbackMessage = getNoInfoMessage(selectedLanguage);

      console.log(`\n==================================================`);
      console.log(`[PDF RAG RETRIEVAL DEBUG - LOW SIMILARITY / NO CHUNKS]`);
      console.log(`QUERY: "${userquery}"`);
      console.log(`LANGUAGE: ${selectedLanguage}`);
      console.log(`TOP SCORE: ${topScore.toFixed(4)} (Threshold: ${SIMILARITY_THRESHOLD})`);
      console.log(`CHUNKS FOUND: ${points.length}`);
      console.log(`FALLBACK MESSAGE: "${fallbackMessage}"`);
      console.log(`==================================================\n`);

      return res.json({
        success: true,
        question: userquery,
        language: selectedLanguage,
        answer: fallbackMessage,
        sources: [],
        debug: {
          query: userquery,
          language: selectedLanguage,
          queryEmbeddingGenerated: true,
          embeddingDimension: queryEmbedding.length,
          chunksRetrievedCount: points.length,
          topScore,
          similarityThreshold: SIMILARITY_THRESHOLD,
          reason: points.length === 0 ? "no_chunks_retrieved" : "low_similarity",
        },
      });
    }

    // 5. Build context from retrieved chunks
    const context = points
      .map((result) => result.payload?.text || "")
      .filter(Boolean)
      .join("\n\n---\n\n");

    const languageInstruction = getLanguageInstructionForRAG(selectedLanguage);

    // 6. Send retrieved context to Llama 3.1
    const prompt = `You are an AI Learning Assistant.

Answer the user's question using ONLY the retrieved context.

The retrieved context may be written in a different language from the user's question. This is expected.

Understand the semantic meaning of the retrieved context and answer the user's question based on that information.

Response language: ${selectedLanguage}

Rules:
1. Answer only from the provided context.
2. Do not invent facts that are not supported by the context.
3. If the context does not contain enough information, clearly say that the available material does not provide enough information.
4. Respond in the selected language (${selectedLanguage}).
   ${languageInstruction}
5. Preserve important technical terms such as RAG, embeddings, vector database, Qdrant, API, LLM, etc. Do not translate technical names unnecessarily.
6. For Hinglish, use natural Hindi-English mixed language.
7. Keep the explanation clear and educational.
8. Do not mention the internal retrieval process unless the user asks.

User Question:
${userquery}

Retrieved Context:
${context}

Answer:
`;

    const answer = await invokeLLM(prompt, { maxTokens: 800 });

    // 7. Retrieval Debugging Console Output
    console.log(`\n==================================================`);
    console.log(`[PDF RAG RETRIEVAL DEBUG]`);
    console.log(`DOCUMENT ID: ${documentId}`);
    console.log(`QUERY: ${userquery}`);
    console.log(`LANGUAGE: ${selectedLanguage}`);
    console.log(`QUERY EMBEDDING: Generated (${queryEmbedding.length} dimensions)`);
    console.log(`\nTOP RESULTS (${points.length}):`);
    points.forEach((p, idx) => {
      const snippet = (p.payload?.text || "").replace(/\s+/g, " ").substring(0, 120);
      console.log(`${idx + 1}. score: ${p.score?.toFixed(4)}\n   chunk: "${snippet}..."`);
    });
    console.log(`\nFINAL RESPONSE:\n${answer}`);
    console.log(`==================================================\n`);

    return res.json({
      success: true,
      question: userquery,
      language: selectedLanguage,
      answer,
      sources: points.map((point) => ({
        chunkIndex: point.payload?.chunkIndex,
        score: point.score,
      })),
      debug: {
        query: userquery,
        language: selectedLanguage,
        queryEmbeddingGenerated: true,
        embeddingDimension: queryEmbedding.length,
        chunksRetrievedCount: points.length,
        topResults: points.map((p) => ({
          score: p.score,
          chunkIndex: p.payload?.chunkIndex,
          textSnippet: p.payload?.text?.substring(0, 150),
        })),
      },
    });
  } catch (error) {
    console.error("[PDF Query Error]:", error);

    return res.status(500).json({
      success: false,
      message: "Error in PDF multilingual question answering",
      error: error.message,
    });
  }
};
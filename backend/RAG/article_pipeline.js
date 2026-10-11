import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { HfInference } from "@huggingface/inference";
import { QdrantClient } from "@qdrant/js-client-rest";
import { randomUUID } from "crypto";
import dotenv from "dotenv";
import mongoose from "mongoose";

import { articleDocument } from "../models/article_model.js";
import { invokeLLM } from "../agents/llm.js";
import {
  normalizeLanguage,
  getNoInfoMessage,
  getLanguageInstructionForRAG,
  SUPPORTED_LANGUAGES,
} from "../services/multilingualHelper.js";

import { GoogleGenAI } from "@google/genai";

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

const COLLECTION_NAME = "article_chunks_gemini";

// ======================================================
// 1. REUSABLE CORE RAG: ARTICLE -> CHUNKS -> EMBEDDINGS -> QDRANT
// ======================================================

export const indexArticleToQdrant = async (articleOrIdOrUrl) => {
  let article = null;

  if (typeof articleOrIdOrUrl === "string") {
    if (mongoose.isValidObjectId(articleOrIdOrUrl)) {
      article = await articleDocument.findById(articleOrIdOrUrl);
    }
    if (!article) {
      article = await articleDocument.findOne({ url: articleOrIdOrUrl });
    }
  } else {
    article = articleOrIdOrUrl;
  }

  if (!article || !article.fullText) {
    throw new Error("Article content not found in database for RAG indexing");
  }

  const fullText = article.fullText;
  console.log(`[Article RAG] Indexing "${article.title}" (${fullText.length} chars)`);

  // Chunk article
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 200,
  });

  const chunks = await splitter.splitText(fullText);
  console.log(`[Article RAG] Created ${chunks.length} chunks`);

  if (chunks.length === 0) {
    throw new Error("No chunks created from article");
  }

  // Create embeddings
  const chunkDocs = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunkText = chunks[i];

    /* const embedding = await hf.featureExtraction({
      model: "BAAI/bge-m3",
      inputs: chunkText,
      provider: "hf-inference",
    }); */

    const response = await ai.models.embedContent({
      model: "gemini-embedding-001",
      contents: chunkText,
      config: { outputDimensionality: 768 },
    });
    const embedding = response.embeddings[0].values;

    chunkDocs.push({
      sourceType: "article",
      sourceKey: article._id.toString(),
      url: article.url,
      chunkIndex: i,
      text: chunkText,
      embedding,
    });
  }

  const vectorDimension = chunkDocs[0].embedding.length || 1024;
  const client = getQdrantClient();

  // Create collection if it doesn't exist
  const collections = await client.getCollections();
  const exists = collections.collections.some(
    (collection) => collection.name === COLLECTION_NAME
  );

  if (!exists) {
    await client.createCollection(COLLECTION_NAME, {
      vectors: {
        size: vectorDimension,
        distance: "Cosine",
      },
    });
    console.log(`[Article RAG] Collection "${COLLECTION_NAME}" created`);
  }

  // Create payload index for strict source isolation
  try {
    await client.createPayloadIndex(COLLECTION_NAME, {
      field_name: "sourceKey",
      field_schema: "keyword",
      wait: true,
    });
  } catch {
    // Index already exists
  }

  try {
    await client.createPayloadIndex(COLLECTION_NAME, {
      field_name: "url",
      field_schema: "keyword",
      wait: true,
    });
  } catch {
    // Index already exists
  }

  // Prepare points
  const points = chunkDocs.map((chunk) => ({
    id: randomUUID(),
    vector: chunk.embedding,
    payload: {
      sourceType: chunk.sourceType,
      sourceKey: chunk.sourceKey,
      url: chunk.url,
      chunkIndex: chunk.chunkIndex,
      text: chunk.text,
    },
  }));

  // Upsert to Qdrant
  await client.upsert(COLLECTION_NAME, {
    wait: true,
    points,
  });

  console.log(`[Article RAG] ${points.length} chunks stored in Qdrant`);

  return {
    articleId: article._id,
    sourceId: article._id,
    sourceType: "article",
    title: article.title,
    url: article.url,
    status: "ready",
    chunksStored: points.length,
    features: ["summary", "notes", "qa"],
  };
};

// ======================================================
// 2. REUSABLE CORE RAG: USER QUESTION -> EMBEDDING -> QDRANT -> LLM
// ======================================================

export const queryArticleAndAnswer = async (userquery, articleOrIdOrUrl, language = "English") => {
  let article = null;

  if (typeof articleOrIdOrUrl === "string") {
    if (mongoose.isValidObjectId(articleOrIdOrUrl)) {
      article = await articleDocument.findById(articleOrIdOrUrl);
    }
    if (!article) {
      article = await articleDocument.findOne({ url: articleOrIdOrUrl });
    }
  } else {
    article = articleOrIdOrUrl;
  }

  if (!article) {
    throw new Error("Article not found for question answering");
  }

  const selectedLanguage = normalizeLanguage(language) || "English";

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

  // Query Qdrant with strict source isolation
  const client = getQdrantClient();
  const results = await client.query(COLLECTION_NAME, {
    query: queryEmbedding,
    with_payload: true,
    limit: 5,
    filter: {
      must: [
        {
          key: "sourceKey",
          match: {
            value: article._id.toString(),
          },
        },
      ],
    },
  });

  const points = results.points || [];
  const SIMILARITY_THRESHOLD = 0.35;
  const topScore = points[0]?.score || 0;

  if (points.length === 0 || topScore < SIMILARITY_THRESHOLD) {
    const fallbackMessage = getNoInfoMessage(selectedLanguage);

    console.log(`\n==================================================`);
    console.log(`[ARTICLE RAG RETRIEVAL DEBUG - LOW SIMILARITY / NO CHUNKS]`);
    console.log(`QUERY: "${userquery}"`);
    console.log(`LANGUAGE: ${selectedLanguage}`);
    console.log(`TOP SCORE: ${topScore.toFixed(4)} (Threshold: ${SIMILARITY_THRESHOLD})`);
    console.log(`FALLBACK MESSAGE: "${fallbackMessage}"`);
    console.log(`==================================================\n`);

    return {
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
    };
  }

  const context = points
    .map((result) => result.payload?.text || "")
    .filter(Boolean)
    .join("\n\n---\n\n");

  const languageInstruction = getLanguageInstructionForRAG(selectedLanguage);

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

  // Retrieval Debugging Console Output
  console.log(`\n==================================================`);
  console.log(`[ARTICLE RAG RETRIEVAL DEBUG]`);
  console.log(`ARTICLE: ${article.title}`);
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

  return {
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
  };
};

// ======================================================
// 3. EXPRESS CONTROLLERS
// ======================================================

export const articleRag = async (req, res) => {
  try {
    const input = req.body?.url || req.body?.articleId || req.body?.sourceId || req.query?.url || req.query?.articleId;

    if (!input) {
      return res.status(400).json({
        success: false,
        message: "Article URL or articleId is required",
      });
    }

    const result = await indexArticleToQdrant(input);

    return res.json({
      success: true,
      message: "Article chunks stored in Qdrant successfully",
      ...result,
    });
  } catch (error) {
    console.error("[Article RAG Error]:", error);

    return res.status(500).json({
      success: false,
      message: "Error in article RAG pipeline",
      error: error.message,
    });
  }
};

export const articleUserQuery = async (req, res) => {
  try {
    const userquery = (
      req.body?.userquery ||
      req.body?.query ||
      req.query?.userquery ||
      req.query?.query ||
      ""
    ).trim();

    const source =
      req.body?.url ||
      req.body?.articleId ||
      req.body?.sourceId ||
      req.query?.url ||
      req.query?.articleId ||
      req.query?.sourceId;

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
        message: "userquery and either articleId or url are required",
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
    console.error("[Article Query Error]:", error);

    return res.status(500).json({
      success: false,
      message: "Error processing article multilingual question",
      error: error.message,
    });
  }
};
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
//import { HfInference } from "@huggingface/inference";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import Transcript from "../models/transcript_model.js";
import { invokeLLM } from "../agents/llm.js";
import { QdrantClient } from "@qdrant/js-client-rest";
import { randomUUID } from "crypto";
import {
  normalizeLanguage,
  getNoInfoMessage,
  getLanguageInstructionForRAG,
  SUPPORTED_LANGUAGES,
} from "../services/multilingualHelper.js";

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

const COLLECTION_NAME = "video_chunks_gemini";

export const rag = async (req, res) => {
  try {
    const url = req.body?.url || req.query?.url;
    const sourceId = req.body?.sourceId || req.query?.sourceId;

    if (!url && !sourceId) {
      return res.status(400).json({
        success: false,
        message: "YouTube URL or sourceId is required",
      });
    }

    // 1. Fetch transcript document from MongoDB
    const query = sourceId ? { _id: sourceId } : { url };
    const transcript = await Transcript.findOne(query);

    if (!transcript || !transcript.fullText) {
      return res.status(404).json({
        success: false,
        message: "No transcript found for this video. Please extract transcript first.",
      });
    }

    const fulltext = transcript.fullText;
    const videoUrl = transcript.url;

    // 2. Split into chunks
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });

    const chunks = await splitter.splitText(fulltext);
    console.log(`[YouTube RAG] Created ${chunks.length} chunks`);

    if (chunks.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No text chunks could be created from transcript",
      });
    }

    // 3. Generate embeddings for each chunk
    const chunkDocs = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunkText = chunks[i];

      /*  const embedding = await hf.featureExtraction({
         model: "BAAI/bge-m3",
         inputs: chunkText,
         provider: "hf-inference",
       }); */

      /* const response = await ai.models.embedContent({
        model: "text-embedding-004",
        contents: chunkText,
      });
      const embedding = response.embedding.values; // 768-dimensional vector */

      const response = await ai.models.embedContent({
        model: "gemini-embedding-001",
        contents: chunkText,
        config: { outputDimensionality: 768 },
      });
      const embedding = response.embeddings[0].values; // 768-dimensional vector

      chunkDocs.push({
        url: videoUrl,
        sourceId: transcript._id.toString(),
        chunkIndex: i,
        text: chunkText,
        embedding,
      });
    }

    const vectorDimension = chunkDocs[0].embedding.length || 1024;

    // 4. Connect to Qdrant
    const client = getQdrantClient();

    // 5. Create collection if it doesn't exist
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
      console.log(`[YouTube RAG] Collection "${COLLECTION_NAME}" created with size ${vectorDimension}`);
    }

    // 6. Payload index for URL & sourceId
    try {
      await client.createPayloadIndex(COLLECTION_NAME, {
        field_name: "url",
        field_schema: "keyword",
        wait: true,
      });
    } catch {
      // index already exists
    }

    try {
      await client.createPayloadIndex(COLLECTION_NAME, {
        field_name: "sourceId",
        field_schema: "keyword",
        wait: true,
      });
    } catch {
      // index already exists
    }

    // 7. Convert chunks into Qdrant points
    const points = chunkDocs.map((chunk) => ({
      id: randomUUID(),
      vector: chunk.embedding,
      payload: {
        url: chunk.url,
        sourceId: chunk.sourceId,
        chunkIndex: chunk.chunkIndex,
        text: chunk.text,
      },
    }));

    // 8. Store vectors in Qdrant
    await client.upsert(COLLECTION_NAME, {
      wait: true,
      points,
    });
    console.log(`[YouTube RAG] ${points.length} chunks stored in Qdrant`);

    return res.json({
      success: true,
      message: "YouTube chunks indexed in Qdrant successfully",
      sourceType: "youtube",
      sourceId: transcript._id,
      title: transcript.title || `YouTube Video (${transcript.videoId || "lecture"})`,
      url: videoUrl,
      status: "ready",
      chunksStored: points.length,
      features: ["summary", "notes", "qa"],
    });
  } catch (error) {
    console.error("[YouTube RAG Error]:", error);
    return res.status(500).json({
      success: false,
      message: "Error in YouTube RAG pipeline",
      error: error.message,
    });
  }
};

// user query --> multilingual embedding (BGE-M3) --> similarity search --> retrieve top k chunks --> construct context --> send to Llama 3.1 --> multilingual response
export const userqueryembedding = async (req, res) => {
  try {
    const userquery = (
      req.body?.userquery ||
      req.body?.query ||
      req.query?.userquery ||
      req.query?.query ||
      ""
    ).trim();
    const url = req.body?.url || req.query?.url;
    const sourceId = req.body?.sourceId || req.query?.sourceId;

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

    if (!userquery) {
      return res.status(400).json({
        success: false,
        message: "userquery is required and cannot be empty",
      });
    }

    if (!url && !sourceId) {
      return res.status(400).json({
        success: false,
        message: "Either YouTube url or sourceId is required",
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

    const client = getQdrantClient();

    // 2. Strict source isolation filter for YouTube video
    const filterMust = [];
    if (url) {
      filterMust.push({
        key: "url",
        match: { value: url },
      });
    } else if (sourceId) {
      filterMust.push({
        key: "sourceId",
        match: { value: sourceId.toString() },
      });
    }

    const results = await client.query(COLLECTION_NAME, {
      query: queryEmbedding,
      with_payload: true,
      limit: 5,
      filter: {
        must: filterMust,
      },
    });

    const points = results.points || [];
    const SIMILARITY_THRESHOLD = 0.35;
    const topScore = points[0]?.score || 0;

    // 3. Check for empty retrieval or low-similarity chunks
    if (points.length === 0 || topScore < SIMILARITY_THRESHOLD) {
      const fallbackMessage = getNoInfoMessage(selectedLanguage);

      console.log(`\n==================================================`);
      console.log(`[YOUTUBE RAG RETRIEVAL DEBUG - LOW SIMILARITY / NO CHUNKS]`);
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

    const context = points
      .map((result) => result.payload?.text || "")
      .filter(Boolean)
      .join("\n\n---\n\n");

    // 4. Construct prompt for Llama 3.1
    const languageInstruction = getLanguageInstructionForRAG(selectedLanguage);

    const prompt = `You are an AI Content & Learning Assistant.

Answer the user's question using ONLY the retrieved context.

The retrieved context can be from ANY type of content: a technical tutorial, educational lecture, song/music lyrics, podcast, speech, story, or article.
The retrieved context may also be written in a different language from the user's question. This is expected.

Understand the semantic meaning of the retrieved context and answer the user's question accurately based on that information.

Response language: ${selectedLanguage}

Rules:
1. Answer only from the provided context.
2. Do not invent facts that are not supported by the context.
3. If the context does not contain enough information, clearly say that the available material does not provide enough information.
4. Respond in the selected language (${selectedLanguage}).
   ${languageInstruction}
5. If technical: preserve technical names, code concepts, and API names without unnecessary translation.
   If music/lyrics/story: explain the meaning, emotions, verses, or narrative faithfully.
6. For Hinglish, use natural Hindi-English mixed language.
7. Keep the explanation clear, insightful, and easy to understand.
8. Do not mention the internal retrieval process unless the user asks.

User Question:
${userquery}

Retrieved Context:
${context}

Answer:
`;

    // 5. Generate final answer with Llama 3.1
    const answer = await invokeLLM(prompt, { maxTokens: 800 });

    // 6. Retrieval Debugging Console Output
    console.log(`\n==================================================`);
    console.log(`[YOUTUBE RAG RETRIEVAL DEBUG]`);
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
    console.error("[YouTube Query Error]:", error);
    return res.status(500).json({
      success: false,
      message: "Error in YouTube multilingual query answering",
      error: error.message,
    });
  }
};
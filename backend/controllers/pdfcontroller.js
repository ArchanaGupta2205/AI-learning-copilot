import { PDFParse } from "pdf-parse";
import mongoose from "mongoose";
import { pdfDocument } from "../models/pdfparse.js";
import { invokeLLM } from "../agents/llm.js";
import {
  normalizeLanguage,
  getLanguageInstructionForNotes,
  SUPPORTED_LANGUAGES,
} from "../services/multilingualHelper.js";

// In-memory fallback cache if MongoDB is offline or IP is not whitelisted
export const memoryPdfStore = new Map();

export const uploadPDF = async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({
        success: false,
        message: "No PDF file provided. Please upload a PDF file.",
      });
    }

    const parser = new PDFParse({
      data: req.file.buffer,
    });

    const data = await parser.getText();
    const fullText = (data.text || "").trim();
    await parser.destroy();

    if (!fullText) {
      return res.status(400).json({
        success: false,
        message: "Could not extract any readable text from the provided PDF file.",
      });
    }

    const fileName = req.file.originalname || "document.pdf";
    let documentId = null;

    // 1. Try to save to MongoDB if connected
    if (mongoose.connection.readyState === 1) {
      try {
        const existingPDF = await pdfDocument.findOne({ fileName }).maxTimeMS(3000);

        if (existingPDF) {
          console.log("PDF already exists in MongoDB:", existingPDF.fileName);
          return res.json({
            success: true,
            message: "PDF already exists in database",
            documentId: existingPDF._id.toString(),
            sourceId: existingPDF._id.toString(),
            sourceType: "pdf",
            fileName: existingPDF.fileName,
            title: existingPDF.fileName,
            text: existingPDF.fullText,
            status: "ready",
            features: ["summary", "notes", "qa"],
          });
        }

        const savedPDF = await pdfDocument.create({
          fileName,
          fileType: req.file.mimetype || "application/pdf",
          fullText,
        });

        documentId = savedPDF._id.toString();
        console.log("PDF saved to MongoDB:", documentId);
      } catch (dbErr) {
        console.warn("MongoDB write failed, using in-memory store:", dbErr.message);
      }
    }

    // 2. If MongoDB is offline/disconnected or errored, use in-memory store
    if (!documentId) {
      documentId = new mongoose.Types.ObjectId().toString();
      const fallbackDoc = {
        _id: documentId,
        fileName,
        fileType: req.file.mimetype || "application/pdf",
        fullText,
        detailednotesSummaryByLang: {},
      };
      memoryPdfStore.set(documentId, fallbackDoc);
      console.log("PDF stored in memory fallback cache:", documentId);
    }

    return res.json({
      success: true,
      message: "PDF uploaded and text extracted successfully",
      documentId,
      sourceId: documentId,
      sourceType: "pdf",
      fileName,
      title: fileName,
      text: fullText,
      status: "ready",
      features: ["summary", "notes", "qa"],
    });
  } catch (error) {
    console.error("PDF Upload Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message ? `PDF error: ${error.message}` : "Failed to extract PDF",
      error: error.message,
    });
  }
};

export const getPdfDetailednotesSummary = async (req, res) => {
  try {
    const documentId = req.body?.documentId || req.query?.documentId;
    let fullText = req.body?.text || req.query?.text;
    let pdfDoc = null;

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

    if (documentId) {
      // 1. Try MongoDB if connected
      if (mongoose.connection.readyState === 1) {
        try {
          pdfDoc = await pdfDocument.findById(documentId);
        } catch (dbErr) {
          console.warn("MongoDB findById failed, checking in-memory cache:", dbErr.message);
        }
      }

      // 2. Fallback to in-memory store
      if (!pdfDoc) {
        pdfDoc = memoryPdfStore.get(documentId.toString());
      }

      // Check language cache
      if (pdfDoc?.detailednotesSummaryByLang?.[selectedLanguage]) {
        return res.json({
          success: true,
          cached: true,
          language: selectedLanguage,
          detailednotesSummary: pdfDoc.detailednotesSummaryByLang[selectedLanguage],
        });
      }

      // Legacy English cache fallback
      if (selectedLanguage === "English" && pdfDoc?.detailednotesSummary) {
        return res.json({
          success: true,
          cached: true,
          language: "English",
          detailednotesSummary: pdfDoc.detailednotesSummary,
        });
      }

      if (!fullText && pdfDoc) {
        fullText = pdfDoc.fullText;
      }
    }

    if (!fullText) {
      return res.status(400).json({
        success: false,
        message: "documentId or text is required",
      });
    }

    const languageInstructions = getLanguageInstructionForNotes(selectedLanguage);

    const prompt = `You are an AI document assistant.
Provide a clear, well-structured, and comprehensive summary of this PDF document in ${selectedLanguage}.
Highlight core concepts, key explanations, and important takeaways with clean headings (##) and bullet points.
${languageInstructions}

PDF Content:
${fullText.substring(0, 15000)}`;

    const detailednotesSummary = await invokeLLM(prompt, { maxTokens: 4000 });

    if (pdfDoc) {
      pdfDoc.detailednotesSummaryByLang = pdfDoc.detailednotesSummaryByLang || {};
      pdfDoc.detailednotesSummaryByLang[selectedLanguage] = detailednotesSummary;
      if (selectedLanguage === "English") {
        pdfDoc.detailednotesSummary = detailednotesSummary;
      }
      if (typeof pdfDoc.save === "function") {
        await pdfDoc.save().catch((err) => console.error("Could not cache PDF notes:", err.message));
      }
    }

    return res.json({
      success: true,
      language: selectedLanguage,
      detailednotesSummary: detailednotesSummary,
    });
  } catch (error) {
    console.error("PDF Notes Generation Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to generate notes for PDF",
      error: error.message,
    });
  }
};
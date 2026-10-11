import mongoose from "mongoose";

const documentSchema = new mongoose.Schema(
  {
    fileName: {
      type: String,
      required: true,
      unique: true
    },

    fileType: {
      type: String,
      required: true
    },

    fullText: {
      type: String,
      required: true
    },

    detailednotesSummary: {
      type: mongoose.Schema.Types.Mixed
    },

    detailednotesSummaryByLang: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  {
    timestamps: true
  }
);

export const pdfDocument = mongoose.model("pdfDocument", documentSchema);
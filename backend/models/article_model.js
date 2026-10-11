import mongoose from "mongoose";

const articleSchema = new mongoose.Schema(
  {
    url: {
      type: String,
      required: true,
      unique: true,
    },

    title: {
      type: String,
      required: true,
    },

    fullText: {
      type: String,
      required: true,
    },

    detailednotesSummary: {
      type: mongoose.Schema.Types.Mixed,
    },

    detailednotesSummaryByLang: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

export const articleDocument = mongoose.model(
  "articleDocument",
  articleSchema
);
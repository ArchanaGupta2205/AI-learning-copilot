import mongoose from "mongoose";

const transcriptItemSchema = new mongoose.Schema(
  {
    text: {
      type: String,
      required: true,
    },
    duration: {
      type: Number,
    },
    offset: {
      type: Number,
    },
  },
  { _id: false }
);

const transcriptSchema = new mongoose.Schema(
  {
    url: {
      type: String,
      required: true,
      trim: true,
    },
    videoId: {
      type: String,
      trim: true,
    },
    title: {
      type: String,
      trim: true,
    },
    rawTranscript: [transcriptItemSchema],
    fullText: {
      type: String,
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

// Create index for fast lookups by video URL
transcriptSchema.index({ url: 1 });

const Transcript = mongoose.model("Transcript", transcriptSchema);

export default Transcript;

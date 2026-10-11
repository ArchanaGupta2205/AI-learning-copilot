import "dotenv/config";
import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import youtubeRoutes from "./routes/youtuberoutes.js";
import pdfRoutes from "./routes/pdfroutes.js";
import articleRoutes from "./routes/articleroutes.js";
import inputbotRoutes from "./routes/inputbotroutes.js";
import webResearchRoutes from "./routes/webResearchRoutes.js";

const app = express();

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
    console.log("REQUEST RECEIVED:", req.method, req.url);
    next();
});

mongoose.set("bufferCommands", false);
mongoose
  .connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 5000,
  })
  .then(() => {
    console.log("MongoDB connected");
  })
  .catch((err) => {
    console.log("MongoDB connection error", err.message || err);
  });

app.get("/", (req, res) => {
  res.json({
    message: "AI Learning Copilot Backend is running",
  });
});

app.use("/api/youtube", youtubeRoutes);
app.use("/api/pdf", pdfRoutes);
app.use("/api/article", articleRoutes);
app.use("/api/inputbot", inputbotRoutes);
app.use("/api/web-research", webResearchRoutes);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
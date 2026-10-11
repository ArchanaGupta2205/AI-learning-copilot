import express from "express";
import { chatWithAssistant } from "../controllers/inputbotcontroller.js";

const router = express.Router();

router.post("/inputbot", chatWithAssistant);

export default router;
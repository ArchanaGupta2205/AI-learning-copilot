import { processUserMessage } from "../services/inputbotservice.js";

export const chatWithAssistant = async (req, res) => {
  try {
    const { message, state } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        message: "Message is required",
      });
    }

    const result = await processUserMessage(
      message,
      state || {}
    );

    return res.json({
      success: true,
      userMessage: message,
      ...result,
    });

  } catch (error) {
    console.error("CHATBOT ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Chatbot failed",
      error: error.message,
    });
  }
};
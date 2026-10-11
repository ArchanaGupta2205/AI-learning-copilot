export const processUserMessage = (message, currentState = {}) => {
  const text = (message || "").trim();
  const lowerText = text.toLowerCase();

  const state = currentState.state || "idle";

  // 1. Waiting for YouTube URL
  if (state === "waiting_for_youtube_url") {
    const isYouTube =
      lowerText.includes("youtube.com") ||
      lowerText.includes("youtu.be");

    if (!isYouTube) {
      return {
        state,
        sourceType: "youtube",
        nextAction: "ask_for_youtube_url",
        response: "Please provide a valid YouTube video URL.",
      };
    }

    return {
      state: "youtube_received",
      sourceType: "youtube",
      nextAction: "process_youtube",
      response: "Great! I received your YouTube video. I'll process it now.",
      data: {
        url: text,
      },
    };
  }

  // 2. Waiting for Article / Website URL
  if (state === "waiting_for_article_url") {
    const isUrl =
      lowerText.startsWith("http://") ||
      lowerText.startsWith("https://");

    if (!isUrl) {
      return {
        state,
        sourceType: "article",
        nextAction: "ask_for_article_url",
        response: "Please provide a valid article or website URL.",
      };
    }

    return {
      state: "article_received",
      sourceType: "article",
      nextAction: "process_article",
      response: "Great! I received the URL. I'll process it now.",
      data: {
        url: text,
      },
    };
  }

  // 3. Waiting for PDF
  if (state === "waiting_for_pdf") {
    return {
      state,
      sourceType: "pdf",
      nextAction: "upload_pdf",
      response: "Please upload your PDF file.",
    };
  }

  // 4. Select source
  if (state === "idle") {
    if (
      lowerText.includes("youtube") ||
      lowerText.includes("video") ||
      lowerText.includes("lecture")
    ) {
      return {
        state: "waiting_for_youtube_url",
        sourceType: "youtube",
        nextAction: "ask_for_youtube_url",
        response: "Sure! Please send me the YouTube video URL.",
      };
    }

    if (
      lowerText.includes("pdf") ||
      lowerText.includes("document")
    ) {
      return {
        state: "waiting_for_pdf",
        sourceType: "pdf",
        nextAction: "ask_for_pdf",
        response: "Sure! Please upload your PDF file.",
      };
    }

    if (
      lowerText.includes("article") ||
      lowerText.includes("website") ||
      lowerText.includes("webpage") ||
      lowerText.includes("blog")
    ) {
      return {
        state: "waiting_for_article_url",
        sourceType: "article",
        nextAction: "ask_for_article_url",
        response: "Sure! Please send the article or website URL.",
      };
    }
  }

  // 5. Default
  return {
    state: "idle",
    sourceType: null,
    nextAction: "ask_source",
    response:
      "What would you like to learn from? You can choose a YouTube video, PDF, or Article/Website.",
  };
};
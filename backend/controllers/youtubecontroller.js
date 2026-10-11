import { getYouTubeTranscript } from "../services/youtube.js";
import { invokeLLM } from "../agents/llm.js";
import Transcript from "../models/transcript_model.js";
import {
    normalizeLanguage,
    getLanguageInstructionForNotes,
    SUPPORTED_LANGUAGES,
} from "../services/multilingualHelper.js";

// Helper to extract YouTube video ID from URL
const extractVideoId = (url) => {
    const regExp = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
    const match = url?.match(regExp);
    return match ? match[1] : null;
};

export const getTranscript = async (req, res) => {
    try {
        const url = req.body?.url || req.query?.url;

        if (!url) {
            return res.status(400).json({
                success: false,
                message: "YouTube URL is required"
            });
        }

        const videoId = extractVideoId(url);
        let savedTranscript = videoId
            ? await Transcript.findOne({ $or: [{ url }, { videoId }] })
            : await Transcript.findOne({ url });

        if (savedTranscript) {
            console.log("Transcript found in database cache");
            return res.json({
                success: true,
                cached: true,
                transcript: savedTranscript.rawTranscript,
                data: savedTranscript
            });
        }

        // 2. Fetch fresh transcript from YouTube
        const transcript = await getYouTubeTranscript(url);

        // 3. Prepare fullText string for RAG/LLM
        const fullText = Array.isArray(transcript)
            ? transcript.map(item => item.text || item).join(" ")
            : (typeof transcript === "string" ? transcript : "");

        // 4. Save to MongoDB
        savedTranscript = await Transcript.create({
            url,
            videoId,
            rawTranscript: Array.isArray(transcript) ? transcript : [],
            fullText
        });

        console.log("Transcript saved to MongoDB successfully");

        res.json({
            success: true,
            cached: false,
            transcript,
            data: savedTranscript
        });

    } catch (error) {
        console.error("Error in getTranscript:", error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

export const postTranscript = async (req, res) => {
    try {
        const transcript = new Transcript(req.body);
        await transcript.save();
        res.json({
            success: true,
            transcript
        });
    } catch (error) {
        console.error("Error in postTranscript:", error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

export const getDetailednotesSummaryfromLLM = async (req, res) => {
    try {
        let transcript = req.body?.transcript || req.query?.transcript;
        const url = req.body?.url || req.query?.url;
        const sourceId = req.body?.sourceId || req.body?.videoId || req.query?.sourceId;
        const forceRegenerate = req.body?.forceRegenerate === true || req.query?.forceRegenerate === "true";

        const rawLanguage = req.body?.language || req.body?.selectedLanguage || req.query?.language || req.query?.selectedLanguage || "English";
        const selectedLanguage = normalizeLanguage(rawLanguage);

        if (!selectedLanguage) {
            return res.status(400).json({
                success: false,
                message: `Unsupported language: "${rawLanguage}". Supported options: ${SUPPORTED_LANGUAGES.join(", ")}`,
                supportedLanguages: SUPPORTED_LANGUAGES,
            });
        }

        const isValidCachedNotes = (notes) => {
            if (!notes) return false;
            if (typeof notes === "string") return notes.trim().length > 20;
            return Boolean(notes.overview || (Array.isArray(notes.keyTakeaways) && notes.keyTakeaways.length > 0));
        };

        let transcriptDoc = null;
        if (url || sourceId) {
            const videoId = url ? extractVideoId(url) : null;
            if (sourceId) {
                transcriptDoc = await Transcript.findById(sourceId);
            } else if (videoId) {
                transcriptDoc = await Transcript.findOne({ $or: [{ url }, { videoId }] });
            } else {
                transcriptDoc = await Transcript.findOne({ url });
            }
            
            // Check language cache only if not forcing regeneration
            if (!forceRegenerate) {
                const langCached = transcriptDoc?.detailednotesSummaryByLang?.[selectedLanguage];
                if (isValidCachedNotes(langCached)) {
                    return res.json({
                        success: true,
                        cached: true,
                        language: selectedLanguage,
                        detailednotesSummary: langCached,
                    });
                }

                // Fallback for English legacy cache
                if (selectedLanguage === "English" && isValidCachedNotes(transcriptDoc?.detailednotesSummary)) {
                    return res.json({
                        success: true,
                        cached: true,
                        language: "English",
                        detailednotesSummary: transcriptDoc.detailednotesSummary,
                    });
                }
            }

            if (!transcript && transcriptDoc) {
                transcript = transcriptDoc.fullText || transcriptDoc.rawTranscript;
            }
        }

        if (!transcript) {
            return res.status(400).json({
                success: false,
                message: "Transcript, url, or sourceId is required"
            });
        }

        // Convert transcript to plain text if it is an array of objects
        const transcriptText = Array.isArray(transcript)
            ? transcript.map(item => item.text || item).join(" ")
            : (typeof transcript === "string" ? transcript : JSON.stringify(transcript));

        const languageInstructions = getLanguageInstructionForNotes(selectedLanguage);

        const prompt = `You are an expert AI video assistant.
Provide a clear, well-structured, and comprehensive summary and notes for this YouTube video in ${selectedLanguage}.

Adapt your format and tone naturally to the content:
- For songs, music, or poetry: explain the story, lyrical themes, emotions, and notable lines.
- For tutorials or technical lectures: explain the core concepts, steps, and key takeaways.
- For podcasts, interviews, or discussions: summarize main arguments, perspectives, and highlights.
- For stories, speeches, or general videos: provide a compelling overview and memorable points.

Use clean formatting with clear headings (##), bullet points, and concise paragraphs.
${languageInstructions}

Transcript:
${transcriptText}`;

        const detailednotesSummary = await invokeLLM(prompt, { maxTokens: 4000 });

        // Cache the notes by language in MongoDB
        if (transcriptDoc) {
            transcriptDoc.detailednotesSummaryByLang = transcriptDoc.detailednotesSummaryByLang || {};
            transcriptDoc.detailednotesSummaryByLang[selectedLanguage] = detailednotesSummary;
            if (selectedLanguage === "English") {
                transcriptDoc.detailednotesSummary = detailednotesSummary;
            }
            transcriptDoc.markModified("detailednotesSummaryByLang");
            await transcriptDoc.save().catch(err => console.error("Could not cache notes:", err.message));
        }

        res.json({
            success: true,
            language: selectedLanguage,
            detailednotesSummary: detailednotesSummary
        });

    } catch (error) {
        console.error("Error generating notes from LLM:", error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};




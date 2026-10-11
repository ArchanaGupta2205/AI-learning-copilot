import { YoutubeTranscript } from "youtube-transcript";

export const getYouTubeTranscript = async (url) => {
    try {
        const transcript = await YoutubeTranscript.fetchTranscript(url);

        return transcript;
    } catch (error) {
        console.error("Error fetching YouTube transcript:", error);
        throw new Error("Could not fetch YouTube transcript");
    }
};
# 🧠 AI Learning Copilot

> An intelligent, multilingual AI copilot for multimodal learning. Extract knowledge, generate structured notes, and chat with your YouTube videos, PDF documents, and web research using **Source-Isolated RAG**, **Google Gemini**, and **Qdrant Vector Database**.

---

## 🚀 Key Features

* **🎥 YouTube Video Copilot (Ask AI Style)**
  * Extracts transcripts automatically using `youtube-transcript`.
  * Generates clean, natural summaries and comprehensive notes.
  * Dynamically adapts to any content: coding tutorials, lectures, podcasts, or music lyrics.
* **📄 PDF Document Deep Learning**
  * Parses and chunks complex PDF documents using LangChain's recursive splitters.
  * Embeds and indexes content into Qdrant for semantic search.
* **🌐 Web Article & Autonomous Research**
  * Real-time web scraping with Cheerio and intelligent web search via Tavily API.
  * Synthesizes web articles into structured takeaways.
* **💬 Source-Isolated Multilingual RAG Q&A**
  * Strict vector isolation: chatbot queries search **only** chunks belonging to the active source document.
  * Full multilingual support: **English**, **Hindi (हिन्दी)**, **Hinglish**, **Spanish (Español)**, and **French (Français)**.
  * Real-time retrieval inspector showing similarity scores and context chunks.
* **⚡ Production-Ready Resiliency & Caching**
  * Dual-layer caching in MongoDB by language to eliminate redundant API calls.
  * Automatic retries with exponential backoff for high-demand spikes (`503` / `429`).
  * One-click **🔄 Regenerate** to refresh notes on demand.

---

## 🛠️ Architecture & Tech Stack

```
[ Frontend: React 19 + Vite ] 
              │
              ▼  HTTP / REST
[ Backend: Express.js (Node.js) ]
       │            │            │
       ▼            ▼            ▼
[ Google Gemini ] [ Qdrant DB ] [ MongoDB ]
 (LLM & Embeddings) (Vector Store) (Document Cache)
```

| Layer | Technology |
| :--- | :--- |
| **Frontend** | React 19, Vite, Vanilla CSS (Glassmorphism Dark UI) |
| **Backend** | Node.js, Express.js (ES Modules) |
| **LLM & Embeddings** | Google Gemini (`gemini-3.8-flash` / `gemini-embedding-001`) |
| **Vector Database** | Qdrant Cloud |
| **Database & Cache** | MongoDB Atlas via Mongoose |
| **RAG Pipeline** | LangChain Text Splitters, Cosine Similarity Filtering |
| **Data Extraction** | `youtube-transcript`, `pdf-parse`, `cheerio`, `axios` |
| **Web Research** | Tavily Search API |

---

## 📁 Project Structure

```bash
AI-learning-copilot/
├── backend/
│   ├── agents/
│   │   └── llm.js                 # Gemini LLM client with retry & fallback
│   ├── controllers/
│   │   ├── youtubecontroller.js   # YouTube transcript & notes controller
│   │   ├── pdfcontroller.js       # PDF ingestion & notes controller
│   │   ├── articlecontroller.js   # Web scraping & article controller
│   │   └── webResearchController.js # Tavily search integration
│   ├── models/                    # MongoDB schemas (Transcript, PDF, Article)
│   ├── RAG/                       # Qdrant indexing & similarity retrieval pipelines
│   ├── routes/                    # API endpoints
│   ├── services/                  # Multilingual helpers & transcript services
│   └── index.js                   # Express server entry point
├── src/
│   ├── components/
│   │   ├── OnboardingChatbot.jsx  # Smart conversational input interface
│   │   └── LearningWorkspace.jsx  # Workspace with Notes & RAG Chatbot
│   ├── api.js                     # Frontend API client
│   ├── App.jsx                    # Root view controller
│   └── index.css                  # Modern design system & tokens
├── package.json
└── README.md
```

---

## ⚙️ Getting Started

### 1. Prerequisites
* **Node.js**: v18.0.0 or higher
* **MongoDB**: A free MongoDB Atlas cluster connection string
* **Qdrant**: A free Qdrant Cloud cluster URL & API key
* **Google Gemini API Key**: From [Google AI Studio](https://aistudio.google.com/)

---

### 2. Backend Setup

1. Open terminal and navigate to `backend/`:
   ```bash
   cd backend
   npm install
   ```

2. Create a `.env` file inside `backend/`:
   ```env
   PORT=5000
   MONGO_URI=your_mongodb_connection_string
   GEMINI_API_KEY=your_gemini_api_key
   qdrant_URL=your_qdrant_cluster_url
   api_key_Qdrant=your_qdrant_api_key
   TAVILY_API_KEY=your_tavily_api_key # Optional for web search
   ```

3. Start the backend server:
   ```bash
   npm run dev
   ```

---

### 3. Frontend Setup

1. In a new terminal window from the project root:
   ```bash
   npm install
   ```

2. Start the Vite development server:
   ```bash
   npm run dev
   ```

3. Open your browser at `http://localhost:5173`.

---

## 🌐 Supported Multilingual Options

* **English**
* **Hindi (हिन्दी)**
* **Hinglish** (Natural mixed Hindi-English)
* **Spanish (Español)**
* **French (Français)**

---

## 📜 License

This project is licensed under the MIT License.

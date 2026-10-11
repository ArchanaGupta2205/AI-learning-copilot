# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is enabled on this template. See [this documentation](https://react.dev/learn/react-compiler) for more information.

Note: This will impact Vite dev & build performances.
You can also try [the experimental native React Compiler support in plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react/README.md#rust-react-compiler) by using `compiler: true` in the plugin options instead of using the Babel plugin.

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.



If input is a URL:
Scrapes the web page with Cheerio.
Saves to MongoDB.
Indexes into Qdrant via RAG.
If input is a Query / Question:
LLM understands the question and optimizes the search topic.
Tavily searches the web and returns candidate URLs.
Cheerio scrapes the top valid URL (with automatic fallback to next URL if one is blocked).
Saves to MongoDB.
RAG chunks and stores the vectors into Qdrant.
RAG queries Qdrant and LLM generates the answer to the user's question with source citations!



what is pid 
5:22 PM
PID stands for Process Identifier (Process ID).

What is it?
Every time you run a program or script on your computer (like node index.js, Chrome, VS Code, etc.), Windows or Linux creates an active Process for it in memory.

To keep track of and control each running program, the operating system assigns it a unique numeric ID called the PID.

How it related to your issue:
Yesterday, when you ran node index.js, Windows gave that running server process a specific number: PID 40360.
That process was holding port 5000. Even when you closed or restarted other terminal windows, that specific process (PID 40360) kept running silently in the background.
Because we knew its PID (40360), we were able to tell Windows to directly terminate that exact process:
powershell
Stop-Process -Id 40360 -Force
Once terminated, port 5000 was freed up so your new server with the new Gemini API key could run.
Where can you see PIDs?
Windows Task Manager: Press Ctrl + Shift + Esc, click Details tab, and you will see a column named PID.
Terminal: Commands like netstat -ano or tasklist list all active connections along with their PIDs.
5:22 PM

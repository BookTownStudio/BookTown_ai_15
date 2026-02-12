<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1SoatAPtMSU1w82F5BlugnckA_Q1Y23gA

## Run Locally

**Prerequisites:**  Node.js

1.  **Install dependencies:**
    `npm install`
2.  **Configure Environment Variables:**
    Your Firebase credentials have been added directly to `vite.config.ts`. To run locally with Gemini features, you need to add your Gemini API Key.
    - Create a file named `.env` in the root of the project.
    - Add the following line to the file:
      `GEMINI_API_KEY="YOUR_API_KEY"`
    - Replace `YOUR_API_KEY` with your actual Gemini API key. You can get one from [Google AI Studio](https://makersuite.google.com/app/apikey).
3.  **Run the app:**
    `npm run dev`
import { Request, Response } from "express";
import * as logger from "firebase-functions/logger";

// STUB: @google/genai dependency removed
// import { GoogleGenAI } from "@google/genai";

// FIX: Cast req and res to any to avoid status error.
export const summarizeHandler = async (req: any, res: any) => {
  logger.info("AI Summarize endpoint called (STUB MODE)");
  res.status(501).json({ 
      error: "Summarization engine disabled for stability lock." 
  });
};
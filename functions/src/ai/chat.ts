import { Request, Response } from "express";
import * as logger from "firebase-functions/logger";

// STUB: @google/genai dependency removed to guarantee build stability
// import { GoogleGenAI } from "@google/genai";

// FIX: Cast req and res to any to avoid status error.
export const chatHandler = async (req: any, res: any): Promise<void> => {
  logger.info("AI Chat endpoint called (STUB MODE)");
  res.status(501).json({ 
      ok: false, 
      type: "stability_lock", 
      text: "The Librarian is currently offline for system maintenance." 
  });
};
import { Request, Response } from "express";
import { admin } from "../firebaseAdmin";
import * as logger from "firebase-functions/logger";

// FIX: Cast req and res to any to avoid property existence errors (method, status, body) in strict environments.
export const createProjectHandler = async (req: any, res: any): Promise<void> => {
  // CORS is handled by the caller wrapper in index.ts
  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }

  try {
    const { uid, project } = req.body;

    if (!uid || !project) {
      res.status(400).json({ error: "Missing uid or project data" });
      return;
    }

    const db = admin.firestore();
    const now = new Date().toISOString();
    
    // Server-side authoritative timestamps
    const projectData = {
      ...project,
      updatedAt: now,
      createdAt: now,
      status: project.status || 'Draft',
      wordCount: project.wordCount || 0
    };

    // Atomic creation
    const docRef = await db.collection('users').doc(uid).collection('projects').add(projectData);
    
    logger.info(`Project materialized: ${docRef.id} for user ${uid}`);

    // Return the canonical object including the server ID
    res.status(200).json({
      id: docRef.id,
      ...projectData
    });
    return;

  } catch (error: any) {
    logger.error("Critical error in project materialization:", error);
    res.status(500).json({ error: "Failed to materialize project document" });
    return;
  }
};
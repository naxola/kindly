/**
 * PDF → plain text extraction (Fase 7b), via `unpdf` (a maintained,
 * serverless-friendly wrapper around pdf.js — no native binaries, works on
 * Vercel). Purely local parsing: no network, no API key.
 */
import { extractText, getDocumentProxy } from "unpdf";

/**
 * Extract the full text of a PDF, pages merged into one string (page
 * breaks are not semantically meaningful for chunking — an article can
 * straddle a page boundary).
 */
export async function extractPdfText(data: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(data);
  const { text } = await extractText(pdf, { mergePages: true });
  return text;
}

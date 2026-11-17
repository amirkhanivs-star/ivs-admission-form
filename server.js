import express from "express";
import path from "path";
import dotenv from "dotenv";
import cors from "cors";
import morgan from "morgan";
import fs from "fs";
import fsPromises from "fs/promises";
import { fileURLToPath, pathToFileURL } from "url";

/*
  IVS Admission Form Server
  - Serves index.html, script.js, styles.css, and img/ from the project root
  - Implements secure server-side dashboard integration with environment variables
  - Provides reliable local persistent admission storage and duplicate detection
*/

dotenv.config();

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Check review mode and serverless execution
function isReviewMode() {
  return process.env.ADMISSION_REVIEW_MODE === "true" ||
    process.env.ADMISSION_REVIEW_MODE === "1" ||
    Boolean(process.env.VERCEL && process.env.ADMISSION_REVIEW_MODE !== "false");
}

const isServerless = Boolean(process.env.VERCEL || process.env.VERCEL_ENV || process.env.AWS_LAMBDA_FUNCTION_NAME);

// Secure configuration from environment
const PORT = process.env.PORT || 5000;
const DASHBOARD_API_URL = process.env.DASHBOARD_API_URL || "https://dashboard.iqravs.com/api/admissions";
const DASHBOARD_API_KEY = process.env.DASHBOARD_API_KEY || "";
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "admissions.json");

// Ensure local data storage directory exists safely (prevent crashes on read-only serverless filesystems)
if (!isReviewMode()) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  } catch (err) {
    console.warn("[Storage] Warning: Local data directory could not be created (read-only filesystem):", err.message);
  }
}

// Storage helpers
async function readLocalAdmissions() {
  if (isReviewMode() && !fs.existsSync(DATA_FILE)) {
    return [];
  }
  try {
    if (!fs.existsSync(DATA_FILE)) {
      if (!isReviewMode()) {
        try {
          await fsPromises.writeFile(DATA_FILE, "[]", "utf8");
        } catch (writeErr) {
          console.warn("[Storage] Could not initialize admissions file:", writeErr.message);
        }
      }
      return [];
    }
    const raw = await fsPromises.readFile(DATA_FILE, "utf8");
    return JSON.parse(raw || "[]");
  } catch (err) {
    console.error("[Storage] Error reading local admissions:", err.message);
    return [];
  }
}

async function writeLocalAdmissions(admissions) {
  if (isReviewMode()) {
    console.log("[Storage] Review mode active: Skipping persistent filesystem write.");
    return true;
  }
  const tempFile = `${DATA_FILE}.tmp`;
  const backupFile = `${DATA_FILE}.bak`;
  const data = JSON.stringify(admissions, null, 2);
  try {
    // Keep a backup of existing file
    if (fs.existsSync(DATA_FILE)) {
      try {
        await fsPromises.copyFile(DATA_FILE, backupFile);
      } catch {}
    }
    // Atomic write via temp file and rename
    await fsPromises.writeFile(tempFile, data, "utf8");
    await fsPromises.rename(tempFile, DATA_FILE);
    return true;
  } catch (err) {
    console.error("[Storage] Error writing local admissions:", err.message);
    throw err;
  }
}

function normalizeStr(str) {
  return String(str || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizePhone(phone) {
  const s = String(phone || "").trim();
  return (s.startsWith("+") ? "+" : "") + s.replace(/\D+/g, "");
}

function sanitizeText(str, maxLength = 255) {
  if (typeof str !== "string") return str;
  return str
    .replace(/<[^>]*>/g, "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .trim()
    .slice(0, maxLength);
}

// In-memory sliding window rate limiter (max 30 submissions per 15 min per IP)
const submissionRateLimits = new Map();
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const MAX_SUBMISSIONS_PER_WINDOW = 30;

function isRateLimited(ip) {
  const now = Date.now();
  const timestamps = submissionRateLimits.get(ip) || [];
  const validTimestamps = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (validTimestamps.length >= MAX_SUBMISSIONS_PER_WINDOW) {
    submissionRateLimits.set(ip, validTimestamps);
    return true;
  }
  validTimestamps.push(now);
  submissionRateLimits.set(ip, validTimestamps);
  return false;
}

async function checkDuplicateAdmission(studentName, dob, guardianWhatsapp) {
  const admissions = await readLocalAdmissions();
  const nameNorm = normalizeStr(studentName);
  const dobNorm = String(dob || "").trim();
  const phoneNorm = normalizePhone(guardianWhatsapp);

  if (!nameNorm || !dobNorm || !phoneNorm) return false;

  return admissions.some((item) => {
    const itemPhone = normalizePhone(item.guardian_whatsapp || item.guardianWhatsapp);
    if (itemPhone !== phoneNorm) return false;

    if (item.children && Array.isArray(item.children)) {
      return item.children.some((c) => {
        return normalizeStr(c.student_name || c.studentName) === nameNorm &&
               String(c.dob || "").trim() === dobNorm;
      });
    }

    const itemStudent = normalizeStr(item.studentName || item.student_name);
    const itemDob = String(item.dob || "").trim();
    return itemStudent === nameNorm && itemDob === dobNorm;
  });
}

app.use(cors());
app.use(morgan("dev"));
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true, limit: "5mb" }));

// Ensure public frontend assets exist and are synchronized when running locally or on Render
function ensurePublicAssets() {
  if (isServerless) return;
  try {
    const publicDir = path.join(__dirname, "public");
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }
    const filesToSync = ["index.html", "styles.css", "script.js", "google.html"];
    for (const f of filesToSync) {
      const src = path.join(__dirname, f);
      const dest = path.join(publicDir, f);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, dest);
      }
    }
    const imgSrc = path.join(__dirname, "img");
    const imgDest = path.join(publicDir, "img");
    if (fs.existsSync(imgSrc)) {
      if (!fs.existsSync(imgDest)) {
        fs.mkdirSync(imgDest, { recursive: true });
      }
      fs.cpSync(imgSrc, imgDest, { recursive: true });
    }
  } catch (err) {
    console.warn("[Assets] Public asset synchronization note:", err.message);
  }
}
ensurePublicAssets();

// Static frontend files
app.use(express.static(path.join(__dirname, "public")));
app.use(express.static(__dirname));

// Open form
app.get("/", (_req, res) => {
  const publicIndexPath = path.join(__dirname, "public", "index.html");
  if (fs.existsSync(publicIndexPath)) {
    return res.sendFile(publicIndexPath);
  }
  const indexPath = path.join(__dirname, "index.html");
  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }
  res.send("IVS Admission Form Server");
});

/* Service Status & Review Mode Endpoint */
app.get("/api/status", (_req, res) => {
  const reviewActive = isReviewMode();
  res.json({
    ok: true,
    service: "ivs-admission-form",
    reviewMode: reviewActive,
    environment: reviewActive ? "review" : (process.env.NODE_ENV || "production")
  });
});

/* Duplicate check endpoint
   /api/forms/check?name=..&dob=YYYY-MM-DD&guardian=+92...
*/
app.get("/api/forms/check", async (req, res) => {
  try {
    const { name = "", dob = "", guardian = "" } = req.query;
    if (!name || !dob || !guardian) return res.json({ exists: false });

    if (isReviewMode()) {
      return res.json({ exists: false, reviewMode: true });
    }

    const exists = await checkDuplicateAdmission(name, dob, guardian);
    res.json({ exists: Boolean(exists) });
  } catch (e) {
    console.error("[Check] Duplicate check error:", e.message);
    res.status(500).json({ exists: false, error: "failed_to_check" });
  }
});

/* Legacy forms endpoint */
app.post("/api/forms", async (req, res) => {
  try {
    const payload = req.body;
    const studentName = payload?.studentName || payload?.student_name || payload?.children?.[0]?.student_name;
    const signature = payload?.signatureDataUrl || payload?.signature_data_url;

    if (!studentName || !signature) {
      return res.status(400).json({
        ok: false,
        error: "validation_failed",
        message: "studentName and signature are required."
      });
    }

    if (isReviewMode()) {
      const previewId = "REV-" + Date.now();
      return res.status(200).json({
        ok: true,
        reviewMode: true,
        id: previewId,
        message: "Submissions are disabled in the advisor review environment. No data was saved."
      });
    }

    const guardian = payload?.guardianWhatsapp || payload?.guardian_whatsapp;
    const dob = payload?.dob || payload?.children?.[0]?.dob;
    const isDup = await checkDuplicateAdmission(studentName, dob, guardian);
    if (isDup) {
      return res.status(409).json({
        ok: false,
        error: "duplicate",
        message: "An admission with the same student, DOB and guardian WhatsApp already exists."
      });
    }

    const admissions = await readLocalAdmissions();
    const id = "ADM-" + Date.now() + "-" + Math.random().toString(36).substring(2, 7).toUpperCase();
    const record = {
      id,
      ...payload,
      createdAt: new Date().toISOString()
    };
    admissions.unshift(record);
    await writeLocalAdmissions(admissions);

    console.log(`[Forms] Saved admission ID: ${id}`);
    res.json({ ok: true, id });
  } catch (e) {
    console.error("[Forms] Save error:", e.message);
    res.status(500).json({ ok: false, error: "failed_to_save" });
  }
});

/* Inspection endpoint (omits heavy signature payloads) */
app.get("/api/forms", async (_req, res) => {
  try {
    const rows = await readLocalAdmissions();
    const sanitized = rows.slice(0, 25).map((r) => {
      const { signatureDataUrl, signature_data_url, ...rest } = r;
      return {
        ...rest,
        hasSignature: Boolean(signatureDataUrl || signature_data_url)
      };
    });
    res.json(sanitized);
  } catch (e) {
    console.error("[Forms] Fetch error:", e.message);
    res.status(500).json({ ok: false, error: "failed_to_fetch" });
  }
});

/* Primary Secure Admission Submission Endpoint */
app.post("/api/admissions/submit", async (req, res) => {
  try {
    const clientIp = req.ip || req.socket?.remoteAddress || "unknown";
    if (process.env.NODE_ENV !== "test" && isRateLimited(clientIp)) {
      return res.status(429).json({
        ok: false,
        success: false,
        error: "rate_limit_exceeded",
        message: "Too many submission attempts. Please wait a few minutes before trying again."
      });
    }

    const payload = req.body;

    // 1. Validation
    if (!payload || typeof payload !== "object") {
      return res.status(400).json({
        ok: false,
        success: false,
        error: "invalid_payload",
        message: "Invalid submission data."
      });
    }

    const children = Array.isArray(payload.children) ? payload.children : [];
    if (!children.length) {
      return res.status(400).json({
        ok: false,
        success: false,
        error: "missing_children",
        message: "At least one child record is required for admission."
      });
    }

    const primaryChild = children[0];
    const studentName = primaryChild.student_name || payload.student_name || payload.studentName;
    const dob = primaryChild.dob || payload.dob;
    const guardianWhatsapp = payload.guardian_whatsapp || payload.guardianWhatsapp;
    const signature = payload.signature_data_url || payload.signatureDataUrl;

    if (!studentName || !guardianWhatsapp) {
      return res.status(400).json({
        ok: false,
        success: false,
        error: "missing_required_fields",
        message: "Student name and guardian WhatsApp number are required."
      });
    }

    if (!payload.declaration_acknowledged && !payload.declarationAcknowledged) {
      return res.status(400).json({
        ok: false,
        success: false,
        error: "declaration_not_accepted",
        message: "Parent declaration must be acknowledged before submitting."
      });
    }

    if (!signature || typeof signature !== "string" || !signature.startsWith("data:image/") || signature.length < 50) {
      return res.status(400).json({
        ok: false,
        success: false,
        error: "signature_required",
        message: "A valid handwritten parent/guardian signature is required before submitting."
      });
    }

    // In Advisor Review Mode: Do NOT save to disk, do NOT sync to dashboard.
    // Allow parents/advisors to test form, validate, and preview PDF generation safely.
    if (isReviewMode()) {
      const previewId = "REV-" + Date.now() + "-" + Math.random().toString(36).substring(2, 7).toUpperCase();
      console.log(`[Admissions] [REVIEW MODE] Submission validated successfully for student "${sanitizeText(studentName, 50)}". Submissions disabled in review environment; no real data saved or transmitted.`);
      return res.status(200).json({
        ok: true,
        success: true,
        reviewMode: true,
        localSaved: false,
        dashboardSaved: false,
        id: previewId,
        applicationId: previewId,
        dashboardStatus: null,
        dashboardMessage: "Advisor Review Mode: Submissions disabled. No records sent to central dashboard.",
        status: {
          localSaved: false,
          dashboardSaved: false,
          reviewMode: true
        },
        message: "Advisor Review Mode: Form validation passed! Submissions are disabled in this review deployment; no data was saved or sent to the central dashboard. Your test PDF is now being generated."
      });
    }

    const admissions = await readLocalAdmissions();
    const submissionId = payload.submission_id || payload.submissionId;

    // 2. Idempotent Retry Check: if same submissionId was already processed, do not duplicate
    if (submissionId) {
      const existingBySubId = admissions.find(
        (a) => a.submission_id === submissionId || a.submissionId === submissionId
      );
      if (existingBySubId) {
        console.log(`[Admissions] Idempotent retry detected for submission ID: ${submissionId} (Record ID: ${existingBySubId.id})`);

        let retryDashSaved = existingBySubId.dashboardSaved || false;
        let retryDashStatus = existingBySubId.dashboardStatus || null;
        let retryDashMessage = existingBySubId.dashboardMessage || "";

        if (!retryDashSaved && DASHBOARD_API_KEY && DASHBOARD_API_URL) {
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 8000);
            const dashRes = await fetch(DASHBOARD_API_URL, {
              method: "POST",
              headers: { "Content-Type": "application/json", "x-api-key": DASHBOARD_API_KEY },
              body: JSON.stringify(payload),
              signal: controller.signal
            });
            clearTimeout(timeoutId);
            retryDashStatus = dashRes.status;
            const dashData = await dashRes.json().catch(() => ({}));
            if (dashRes.ok && (dashData.success === undefined || dashData.success === true)) {
              retryDashSaved = true;
              retryDashMessage = "Synced with central dashboard.";
              existingBySubId.dashboardSaved = true;
              existingBySubId.dashboardStatus = dashRes.status;
              existingBySubId.dashboardMessage = retryDashMessage;
              await writeLocalAdmissions(admissions);
            }
          } catch (e) {
            console.warn("[Admissions] Retry dashboard sync error:", e.message);
          }
        }

        return res.status(200).json({
          ok: true,
          success: true,
          localSaved: true,
          id: existingBySubId.id,
          applicationId: existingBySubId.id,
          isRetry: true,
          dashboardSaved: retryDashSaved,
          dashboardStatus: retryDashStatus,
          dashboardMessage: retryDashSaved ? "Synced with central dashboard." : (retryDashMessage || "Saved locally. Awaiting central sync."),
          status: {
            localSaved: true,
            dashboardSaved: retryDashSaved
          },
          message: retryDashSaved
            ? "Admission registration re-submitted and synced with central dashboard."
            : "Admission registration already received and saved locally. Central dashboard sync will be completed by admissions team."
        });
      }
    }

    // 3. Duplicate Check on student + DOB + guardian phone
    const isDup = await checkDuplicateAdmission(studentName, dob, guardianWhatsapp);
    if (isDup) {
      return res.status(409).json({
        ok: false,
        success: false,
        isDuplicate: true,
        error: "duplicate",
        message: "An admission registration for this student and guardian already exists."
      });
    }

    // 4. Local Storage Persistence with input sanitization
    const id = "ADM-" + Date.now() + "-" + Math.random().toString(36).substring(2, 7).toUpperCase();
    const sanitizedPayload = {
      ...payload,
      student_name: sanitizeText(studentName, 120),
      father_name: sanitizeText(payload.father_name || payload.fatherName || "", 120),
      guardian_name: sanitizeText(payload.guardian_name || payload.guardianName || "", 120),
      guardian_whatsapp: sanitizeText(guardianWhatsapp, 30),
      city: sanitizeText(payload.city || "", 80),
      present_address: sanitizeText(payload.present_address || payload.presentAddress || "", 300)
    };

    const localRecord = {
      id,
      ...sanitizedPayload,
      createdAt: new Date().toISOString()
    };

    admissions.unshift(localRecord);
    await writeLocalAdmissions(admissions);

    // 5. Secure Forwarding to Dashboard API
    let dashboardSaved = false;
    let dashboardStatus = null;
    let dashboardMessage = "";

    if (DASHBOARD_API_KEY && DASHBOARD_API_URL) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        const dashRes = await fetch(DASHBOARD_API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": DASHBOARD_API_KEY
          },
          body: JSON.stringify(sanitizedPayload),
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        dashboardStatus = dashRes.status;
        const dashData = await dashRes.json().catch(() => ({}));

        if (dashRes.ok && (dashData.success === undefined || dashData.success === true)) {
          dashboardSaved = true;
          dashboardMessage = "Synced with central dashboard.";
        } else {
          dashboardSaved = false;
          dashboardMessage = dashData.message || `Remote dashboard returned status ${dashRes.status}. Awaiting sync.`;
          console.warn(`[Admissions] Dashboard sync status ${dashRes.status}:`, dashData.message || "non-success");
        }
      } catch (dashErr) {
        dashboardSaved = false;
        dashboardStatus = 503;
        dashboardMessage = "Central dashboard unreachable (" + dashErr.message + ").";
        console.warn("[Admissions] Dashboard network error:", dashErr.message);
      }
    } else {
      dashboardSaved = false;
      dashboardMessage = "Dashboard API credentials not configured in server environment (central sync unverified).";
    }

    // Safety invariant: never claim synced when dashboardSaved is false
    if (!dashboardSaved && (!dashboardMessage || dashboardMessage.toLowerCase().includes("synced with central dashboard"))) {
      dashboardMessage = "Saved locally. Awaiting central dashboard sync.";
    }

    // Privacy-safe server logging (no API keys, no signatures, no personal contact data)
    console.log(`[Admissions] Processed registration ID: ${id} | Children: ${children.length} | Local: OK | Dashboard: ${dashboardSaved ? "SYNCED" : "PENDING"}`);

    res.status(200).json({
      ok: true,
      success: true,
      localSaved: true,
      id,
      applicationId: id,
      dashboardSaved,
      dashboardStatus,
      dashboardMessage,
      status: {
        localSaved: true,
        dashboardSaved
      },
      message: dashboardSaved
        ? "Admission registration submitted and synced with central dashboard."
        : "Admission registered and saved locally. Central dashboard sync will be completed by the admissions team."
    });
  } catch (err) {
    console.error("[Admissions] Submit exception:", err.message);
    res.status(500).json({
      ok: false,
      success: false,
      error: "server_error",
      message: "Failed to process admission registration. Please try again."
    });
  }
});

export default app;
export { app, checkDuplicateAdmission, readLocalAdmissions, writeLocalAdmissions, isReviewMode };

const isDirectExecution = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution && process.env.NODE_ENV !== "test" && !isServerless) {
  app.listen(PORT, () => console.log(`Server running: http://localhost:${PORT}`));
}

import express from "express";
import path from "path";
import dotenv from "dotenv";
import cors from "cors";
import morgan from "morgan";
import { fileURLToPath } from "url";

dotenv.config();
const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(cors());
app.use(morgan("dev"));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// static frontend
app.use(express.static(path.join(__dirname, "public")));

/* Optional: quick duplicate check endpoint (for client-side pre-check)
   /api/forms/check?name=..&dob=YYYY-MM-DD&guardian=+92...
   Returns {exists: true/false}
*/
app.get("/api/forms/check", async (req, res) => {
  const { name = "", dob = "", guardian = "" } = req.query;
  if (!name || !dob || !guardian) return res.json({ exists: false });

  // replicate normalizers used in the model
  const nameNorm = String(name).trim().toLowerCase().replace(/\s+/g, " ");
  const guardianNorm = (guardian.startsWith("+") ? "+" : "") + guardian.replace(/\D+/g, "");

  const exists = await Form.exists({
    studentNameNorm: nameNorm,
    dob: new Date(dob),
    guardianWhatsappNorm: guardianNorm
  });

  res.json({ exists: Boolean(exists) });
});

app.post("/api/forms", async (req, res) => {
  try {
    const payload = req.body;
    if (!payload?.studentName || !payload?.signatureDataUrl) {
      return res.status(400).json({ error: "studentName and signature are required" });
    }
    // Create — unique index will enforce duplicates at DB level
    const saved = await Form.create(payload);
    res.json({ ok: true, id: saved._id });
  } catch (e) {
    // Duplicate key error from Mongo (E11000)
    if (e && (e.code === 11000 || String(e.message || "").includes("E11000"))) {
      return res.status(409).json({
        ok: false,
        error: "duplicate",
        message: "An admission with the same student, DOB and guardian WhatsApp already exists."
      });
    }
    console.error(e);
    res.status(500).json({ ok: false, error: "failed_to_save" });
  }
});

// For quick inspection
app.get("/api/forms", async (_req, res) => {
  const rows = await Form.find().sort({ createdAt: -1 }).limit(25);
  res.json(rows);
});

  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => console.log(`Server running: http://localhost:${PORT}`));

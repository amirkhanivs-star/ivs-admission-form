import mongoose from "mongoose";

/* ---- Normalizers ---- */
function normalizeName(v = "") {
  return String(v).trim().toLowerCase().replace(/\s+/g, " ");
}
function normalizePhone(v = "") {
  const trimmed = String(v).trim();
  const plus = trimmed.startsWith("+") ? "+" : "";
  const digits = trimmed.replace(/\D+/g, "");
  return plus + digits;
}

const GradeSchema = new mongoose.Schema(
  {
    nur_kg1: Boolean,
    prep_kg2: Boolean,
    g1: Boolean, g2: Boolean, g3: Boolean, g4: Boolean,
    g5: Boolean, g6: Boolean, g7: Boolean,
    g8fb: Boolean, g9fb: Boolean, g11fb: Boolean,
    igcse_custom: String
  },
  { _id: false }
);

const FormSchema = new mongoose.Schema(
  {
    session: String,
    regDate: Date,

    studentName: { type: String, required: true },
    fatherName: String,
    dob: { type: Date },
    gender: String,
    guardianWhatsapp: String,
    religion: String,
    fatherOccupation: String,
    nationality: String,

    grades: GradeSchema,

    address: String,
    city: String,
    state: String,
    zip: String,
    guardianContact: String,
    secondaryContact: String,

    signatureDataUrl: { type: String, required: true },

    // normalized fields for unique key
    studentNameNorm: { type: String, select: false },
    guardianWhatsappNorm: { type: String, select: false }
  },
  { timestamps: true }
);

/* set normalized values before save */
FormSchema.pre("validate", function (next) {
  this.studentNameNorm = normalizeName(this.studentName);
  this.guardianWhatsappNorm = normalizePhone(
    this.guardianWhatsapp || this.guardianContact || ""
  );
  next();
});

/* UNIQUE compound index (partial with $type) */
FormSchema.index(
  { studentNameNorm: 1, dob: 1, guardianWhatsappNorm: 1 },
  {
    unique: true,
    partialFilterExpression: {
      studentNameNorm: { $type: "string" },
      dob: { $type: "date" },
      guardianWhatsappNorm: { $type: "string" }
    },
    name: "uniq_student_dob_guardian"
  }
);

/* ---- Default export (IMPORTANT) ---- */
const Form = mongoose.model("Form", FormSchema);
export default Form;

/* public/script.js
   IVS Admission Form — signature pad + PDF export + print + WhatsApp (app) share
*/
const ADMISSION_SUBMIT_API = "/api/admissions/submit";

function cleanPhoneNumber(value) {
  return String(value || "").replace(/\s+/g, "");
}


document.addEventListener("DOMContentLoaded", () => {
  initSignaturePad();
  wireButtons();
  autoFillCurrentSession();  // auto-fill SESSION like 2026-27, 2027-28
  initSingleGradeSelect();   // make Grade checkboxes single-select
  autoFillRegDate();         // auto-fill DATE OF REGISTRATION with today's date
  initDeclarationMaster();   // declaration master checkbox
  initGuardianWhatsAppDropdown(); // country dropdown for Guardian WhatsApp
  initIgcseSubjectSelection(); // IGCSE dynamic subject selection system (Phase 1)
  initMobileGradePicker();     // Mobile-friendly grade picker modal (<= 768px)
  checkReviewModeStatus();     // Detect advisor review deployment and display review notice
});

/* Advisor Review Mode Detection & Banner */
async function checkReviewModeStatus() {
  try {
    const res = await fetch("/api/status");
    if (!res.ok) return;
    const data = await res.json();
    if (data && data.reviewMode) {
      window.IS_REVIEW_MODE = true;
      showReviewModeBanner();
    }
  } catch (err) {
    // Graceful fallback
  }
}

function showReviewModeBanner() {
  const container = document.querySelector(".wrapper");
  if (!container || document.getElementById("reviewModeBanner")) return;
  const banner = document.createElement("div");
  banner.id = "reviewModeBanner";
  banner.className = "review-mode-banner";
  banner.setAttribute("role", "note");
  banner.innerHTML = `
    <span class="review-mode-banner-badge">Review Mode</span>
    <div>
      <strong>Advisor Review Environment:</strong> Submissions are disabled in this review deployment. Parents and advisors can explore all subject selections, grade pickers, validations, and generate preview PDFs without saving or transmitting admission records.
    </div>
  `;
  const headerBanner = container.querySelector(".header-banner");
  if (headerBanner && headerBanner.parentNode) {
    headerBanner.parentNode.insertBefore(banner, headerBanner.nextSibling);
  } else {
    container.insertBefore(banner, container.firstChild);
  }
}

/* ==========================================================================
   CENTRALIZED IGCSE / O-LEVEL SUBJECT SELECTION CONFIGURATION (PHASE 1)
   ========================================================================== */

const IGCSE_CONFIG = {
  // Configurable academic session settings
  sessionConfig: {
    // Default active session for school admissions (configurable)
    activeSession: "2026-2027",

    // Retrieves current configured or active academic session
    getActiveSession() {
      if (typeof window !== "undefined" && window.IVS_SESSION_OVERRIDE) {
        return window.IVS_SESSION_OVERRIDE;
      }
      const formInput = (typeof document !== "undefined" && document.getElementById("session")?.value?.trim()) ||
                        (typeof document !== "undefined" && document.getElementById("sessionText")?.textContent?.trim());
      if (formInput && formInput !== "--") {
        return formInput;
      }
      return this.activeSession;
    },

    // Check whether active session satisfies threshold (e.g. "2027-2028")
    isSessionAvailable(thresholdSession) {
      const active = this.getActiveSession();
      const parseStartYear = (s) => {
        const match = String(s || "").match(/^(\d{4})/);
        return match ? parseInt(match[1], 10) : 0;
      };
      return parseStartYear(active) >= parseStartYear(thresholdSession);
    }
  },

  // Cambridge examination timeline structure
  examinationPlan: [
    {
      stage: "Grade 9",
      subjects: ["Urdu", "Islamiyat", "Pakistan Studies"],
      scheduleNote: "Pakistani pathway examination stage"
    },
    {
      stage: "Grade 9 or Grade 10",
      subjects: ["English (First or Second Language)"],
      scheduleNote: "Flexible scheduling per candidate readiness"
    },
    {
      stage: "Generally Grade 10",
      subjects: ["Mathematics", "Stream Subjects", "Optional Subjects"],
      scheduleNote: "Culmination and final Cambridge board examination stage"
    }
  ],

  // Compulsory subject rules
  compulsory: {
    mathematics: {
      name: "Mathematics",
      code: "0580", // Default Cambridge syllabus code
      boardCodes: {
        cambridge: "0580",
        pearson_edexcel: null // Not specified / not invented for Edexcel
      },
      isMandatory: true,
      autoSelected: true
    },
    english: {
      isMandatory: true,
      selectionType: "single", // Exactly ONE via radio buttons
      options: [
        {
          id: "English as a First Language",
          name: "English as a First Language",
          code: "0500",
          boardCodes: {
            cambridge: "0500",
            pearson_edexcel: null
          },
          description: "Suitable for students who have a strong command of English, good vocabulary, excellent reading and writing skills, and the ability to express ideas confidently and effectively."
        },
        {
          id: "English as a Second Language",
          name: "English as a Second Language",
          code: "0510",
          boardCodes: {
            cambridge: "0510",
            pearson_edexcel: null
          },
          description: "Suitable for students who have learned English as an additional language and wish to develop their reading, writing, comprehension and communication skills."
        }
      ]
    }
  },

  // Approved Academic Streams for Grade 9 & 10
  streams: {
    pure_sciences: {
      id: "pure_sciences",
      name: "Pure Sciences",
      subjects: ["Biology", "Physics", "Chemistry"],
      availableFromSession: "2025-2026"
    },
    it_engineering: {
      id: "it_engineering",
      name: "IT & Engineering",
      subjects: ["Computer Science", "Physics", "Chemistry"],
      availableFromSession: "2025-2026"
    },
    commerce: {
      id: "commerce",
      name: "Commerce",
      subjects: ["Business Studies", "Accounting", "Economics"],
      availableFromSession: "2025-2026"
    },
    humanities: {
      id: "humanities",
      name: "Humanities",
      subjects: ["Business Studies", "Computer Science", "Psychology", "Sociology"],
      availableFromSession: "2027-2028",
      unavailableMessage: "Humanities stream is available starting from academic session 2027–2028 and is not currently open for selection."
    }
  },

  // Additional Optional Subject (Computer Science)
  optionalSubjects: {
    computer_science: {
      id: "Computer Science",
      name: "Computer Science",
      code: "0478",
      note: "Subject to school approval and availability.",
      disclaimer: "Tracked as an optional subject request, not an automatically approved subject."
    }
  },

  // Pakistani Pathway & IBCC Equivalence
  pakistanPathway: {
    subjects: ["Urdu", "Islamiyat", "Pakistan Studies"],
    examGrade: "Grade 9",
    notice: "These subjects are compulsory for students following the Pakistani examination and equivalence pathway, subject to applicable requirements. Students examining outside Pakistan may qualify for exemptions according to applicable IBCC requirements.",
    verificationDisclaimer: "Exemption requests are recorded as Pending Academic Verification by IVS academic administration in accordance with official IBCC regulations. Eligibility cannot be determined by nationality alone."
  },

  // Grade-Level Academic Rules
  grades: {
    8: {
      curriculum: "IGCSE",
      gradeLevel: 8,
      title: "Grade 8 (IGCSE / Pre-O-Level)",
      status: "pending_confirmation",
      allowStreamSelection: false, // Separately configurable; stream rules not confirmed
      notice: "Final stream-selection requirements for Grade 8 have not yet been confirmed by school administration. Grade 8 follows the preparatory foundation curriculum. Grade 9 stream rules do not automatically apply to Grade 8.",
      foundationSubjects: [
        "Foundation Mathematics",
        "Foundation English",
        "General Science",
        "Urdu / National Language",
        "Islamiyat",
        "Pakistan Studies"
      ]
    },
    9: {
      curriculum: "IGCSE",
      gradeLevel: 9,
      title: "Grade 9 (IGCSE / O-Level)",
      status: "approved",
      allowStreamSelection: true
    },
    10: {
      curriculum: "IGCSE",
      gradeLevel: 10,
      title: "Grade 10 (IGCSE / O-Level)",
      status: "approved",
      allowStreamSelection: true
    }
  },

  // Special Grade 10 Admission & Examination Conditions (Phase 2)
  grade10Rules: {
    examBoards: ["Cambridge", "Pearson Edexcel"],
    appearingYears: ["2027", "2028", "2029"],
    getAppearingYears() {
      if (typeof window !== "undefined" && window.IVS_GRADE10_YEARS) {
        return window.IVS_GRADE10_YEARS;
      }
      return this.appearingYears;
    },
    examSessions: ["May/June", "October/November"],
    syllabusPrepOptions: [
      { id: "Syllabus completed", label: "Syllabus completed" },
      { id: "Partially completed", label: "Partially completed" },
      { id: "Not yet completed", label: "Not yet completed" }
    ],
    counselingSchedule: {
      days: "Monday, Tuesday, Thursday, Friday, Saturday (Excluding Wednesdays)",
      timingWindow: "12:00 PM to 2:00 PM (Pakistan Standard Time - PKT)",
      note: "Admission evaluation is conducted during these counseling hours. Our academic team will contact you for assessment."
    },
    // Configurable admission policies by year & series
    policies: {
      "2027_May/June": {
        status: "Academic Review Required",
        statusType: "warning",
        allowAutoConfirmation: false,
        title: "Academic Review Required (May/June 2027 Series)",
        message: "The school has already completed syllabus coverage for the May/June 2027 examination series and is currently conducting revision, mock examinations, and past-paper practice. Regular school admission requires an academic evaluation before confirmation.",
        possibleOutcomes: [
          "Regular admission after a successful evaluation",
          "Group tuition",
          "Applying for the next academic session"
        ],
        showCounseling: true
      },
      "2027_October/November": {
        status: "Standard Application (Pending Requirements)",
        statusType: "info",
        allowAutoConfirmation: false,
        title: "Standard Admission Pathway (October/November 2027 Series)",
        message: "Applicants for the October/November 2027 series may continue through the normal admission process, subject to standard school admission requirements. Application submission does not constitute confirmed enrollment.",
        possibleOutcomes: [
          "Standard academic evaluation and prerequisite verification",
          "Enrollment subject to available capacity and school criteria"
        ],
        showCounseling: false
      },
      "default": {
        status: "Standard Evaluation Process",
        statusType: "info",
        allowAutoConfirmation: false,
        title: "Standard Admission Review",
        message: "Your application for this examination series will proceed through our standard academic evaluation. Formal confirmation is subject to verification of previous academic transcripts and seat availability.",
        possibleOutcomes: [
          "Academic record verification",
          "Admission confirmation under standard school criteria"
        ],
        showCounseling: false
      }
    },
    evaluate(year, session) {
      if (!year || !session) return null;
      const key = `${year}_${session}`;
      return this.policies[key] || this.policies["default"];
    }
  }
};

/* ==========================================================================
   PHASE 3: MULTI-CHILD INDEPENDENT ACADEMIC SELECTION & REUSABLE COMPONENT
   ========================================================================== */

/* HTML escaping helper to prevent XSS in dynamic summaries */
function escapeHTML(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* Helper to format board-specific Mathematics title (never presents Cambridge 0580 as universal for Pearson Edexcel) */
function getMathSubjectTitle(examBoard) {
  const b = String(examBoard || "").toLowerCase();
  if (b.includes("cambridge")) {
    return "Mathematics (Cambridge 0580)";
  }
  if (b.includes("edexcel")) {
    return "Mathematics (Pearson Edexcel)";
  }
  return "Mathematics (Compulsory)";
}

/* Independent reactive academic state store for each child by ID ("main", "2", "3", etc.) */
const childrenAcademicState = {};

function createDefaultChildAcademicState(childId) {
  return {
    childId: String(childId || "main"),
    currentGradeRaw: "",
    gradeLevel: null,
    curriculum: null,
    isEligible: false,
    englishChoice: "",
    stream: "",
    streamSubjects: [],
    optionalCsRequested: false,
    pathway: "pakistan", // 'pakistan' or 'overseas_exemption'
    exemptions: {
      urdu: false,
      islamiyat: false,
      pakStudies: false
    },
    grade10: {
      examBoard: "",
      appearingYear: "",
      examSession: "",
      syllabusPrep: "",
      grade9ExaminedSubjects: [],
      grade9ExaminedOther: "",
      englishExamStatus: "Appearing in Grade 10",
      exemptionsStatus: "No exemptions (Standard curriculum)",
      exemptionDetails: "",
      admissionStatus: "",
      evaluationDetails: null
    },
    validationErrors: {}
  };
}

// Initial state for the main student
childrenAcademicState["main"] = createDefaultChildAcademicState("main");

// Backward-compatible reference for legacy single-student calls
let igcseState = childrenAcademicState["main"];

function getChildAcademicState(childId) {
  const id = String(childId || "main");
  if (!childrenAcademicState[id]) {
    childrenAcademicState[id] = createDefaultChildAcademicState(id);
  }
  return childrenAcademicState[id];
}

/* Helper to allow external or runtime configuration of the active academic session */
window.setIvsAcademicSession = function (sessionStr) {
  if (!sessionStr) return;
  window.IVS_SESSION_OVERRIDE = String(sessionStr).trim();

  // Update session displays
  const sessionText = document.getElementById("sessionText");
  if (sessionText) sessionText.textContent = window.IVS_SESSION_OVERRIDE;
  const sessionInput = document.getElementById("session");
  if (sessionInput) sessionInput.value = window.IVS_SESSION_OVERRIDE;

  // Re-evaluate stream availability for all active children
  Object.keys(childrenAcademicState).forEach((cid) => {
    const st = childrenAcademicState[cid];
    if (st && st.isEligible && (st.gradeLevel === 9 || st.gradeLevel === 10)) {
      applySessionRulesToStreamsForChild(cid);
      updateChildLiveSummary(cid);
    }
  });

  if (typeof window.generateSummaryHTML === "function") {
    window.generateSummaryHTML();
  }
};

/* Reliable grade and curriculum detection (uses data attributes with robust parser fallback) */
function detectGradeAndCurriculum(gradeSelectElement) {
  if (!gradeSelectElement) {
    return { raw: "", curriculum: "NONE", gradeLevel: null, isEligible: false };
  }

  let raw = "";
  let dataCurriculum = "";
  let dataGrade = "";

  const selectedIndex = gradeSelectElement.selectedIndex;
  if (selectedIndex >= 0 && gradeSelectElement.options[selectedIndex]) {
    const opt = gradeSelectElement.options[selectedIndex];
    raw = opt.value || "";
    dataCurriculum = opt.dataset?.curriculum || "";
    dataGrade = opt.dataset?.grade || "";
  } else {
    raw = gradeSelectElement.value || "";
  }

  // 1. Explicit data attributes check
  if (dataCurriculum && dataGrade) {
    const cur = dataCurriculum.toUpperCase();
    const gLevel = parseInt(dataGrade, 10);
    const isEligible = cur === "IGCSE" && [8, 9, 10].includes(gLevel);
    return { raw, curriculum: cur, gradeLevel: gLevel, isEligible };
  }

  // 2. Strict normalized fallback parsing
  const normalized = String(raw).trim().replace(/[''’]/g, "'");

  // Must be IGCSE/O-Level, but NOT A-Level
  const isIgcse = /\b(IGCSE|O[']?Level)\b/i.test(normalized) && !/\bA[']?Level\b/i.test(normalized);
  const isFbise = /\b(FBISE|Fed)\b/i.test(normalized);

  let gradeLevel = null;
  const match = normalized.match(/Grade\s*(\d+)/i);
  if (match) {
    gradeLevel = parseInt(match[1], 10);
  }

  let curriculum = "OTHER";
  if (isIgcse) curriculum = "IGCSE";
  else if (isFbise) curriculum = "FBISE";

  const isEligible = curriculum === "IGCSE" && [8, 9, 10].includes(gradeLevel);

  return { raw, curriculum, gradeLevel, isEligible };
}

/* Lookup child DOM element by base ID with container and document fallback */
function getChildElement(childId, baseId, containerEl) {
  const isMain = childId === "main" || !childId;
  const targetId = isMain ? baseId : `${baseId}_${childId}`;

  // 1. Try document.getElementById (directly supported in browser and tests)
  if (typeof document !== "undefined" && typeof document.getElementById === "function") {
    const el = document.getElementById(targetId);
    if (el) return el;
    if (isMain) {
      const alias = document.getElementById(`${baseId}_main`);
      if (alias) return alias;
    }
  }

  // 2. Try containerEl.querySelector if available
  if (containerEl && typeof containerEl.querySelector === "function") {
    try {
      const el = containerEl.querySelector(`#${targetId}`) ||
                 containerEl.querySelector(`[id^="${baseId}"]`) ||
                 containerEl.querySelector(`.${baseId}`);
      if (el) return el;
    } catch {}
  }

  return null;
}

/* Scoped query helpers with safe fallback for testing environments */
function scopedQueryAll(root, sel) {
  if (root && typeof root.querySelectorAll === "function") {
    try {
      const res = root.querySelectorAll(sel);
      if (res && res.length) return Array.from(res);
    } catch {}
  }
  if (typeof document !== "undefined" && typeof document.querySelectorAll === "function") {
    try {
      const res = document.querySelectorAll(sel);
      if (res && res.length) return Array.from(res);
    } catch {}
  }
  return [];
}

function scopedQuery(root, sel) {
  if (root && typeof root.querySelector === "function") {
    try {
      const res = root.querySelector(sel);
      if (res) return res;
    } catch {}
  }
  if (typeof document !== "undefined" && typeof document.querySelector === "function") {
    try {
      return document.querySelector(sel);
    } catch {}
  }
  return null;
}

function getRadioName(baseName, childId) {
  return (childId === "main" || !childId) ? baseName : `${baseName}_${childId}`;
}

/* Render reusable IGCSE Subject Selection HTML component parameterized by childId */
function renderAcademicSelectionHTML(childId) {
  const isMain = childId === "main" || !childId;
  const suffix = isMain ? "" : `_${childId}`;
  const radioSuffix = isMain ? "" : `_${childId}`;
  const years = IGCSE_CONFIG.grade10Rules.getAppearingYears();
  const yearOptions = years.map((y) => `<option value="${y}">${y}</option>`).join("");

  return `
    <div class="content igcseSubjectContent" id="igcseSubjectContent${suffix}">
      <!-- Cambridge Examination Plan Banner -->
      <div class="igcse-banner">
        <div class="igcse-banner-title">
          <span class="igcse-badge-icon">📘</span>
          <div>
            <strong>IVS Cambridge IGCSE / O-Level Academic Pathway</strong>
            <div class="igcse-banner-sub">School Examination Plan & Subject Structure</div>
          </div>
        </div>
        <div class="igcse-plan-grid">
          <div class="igcse-plan-card">
            <div class="plan-grade-tag">Grade 9 Exam Stage</div>
            <div class="plan-sub-title">Urdu, Islamiyat &amp; Pakistan Studies</div>
            <div class="plan-sub-note">Pakistani pathway examination stage</div>
          </div>
          <div class="igcse-plan-card">
            <div class="plan-grade-tag">Grade 9 or Grade 10</div>
            <div class="plan-sub-title">English (First or Second Language)</div>
            <div class="plan-sub-note">Flexible examination schedule based on candidate readiness</div>
          </div>
          <div class="igcse-plan-card">
            <div class="plan-grade-tag">Generally Grade 10</div>
            <div class="plan-sub-title">Mathematics &amp; Stream Subjects</div>
            <div class="plan-sub-note">Final Cambridge board examination completion</div>
          </div>
        </div>
      </div>

      <!-- Grade 8 Notice Container -->
      <div id="igcseGrade8Container${suffix}" class="igcseGrade8Container" style="display:none;">
        <div class="igcse-alert-box info">
          <div class="alert-icon">ℹ️</div>
          <div class="alert-body">
            <h4>Grade 8 (Pre-IGCSE / Foundation) Subject Selection Information</h4>
            <p>
              Grade 8 follows the exploratory IGCSE foundation program. Final subject stream selection requirements for Grade 8 have not yet been confirmed by school administration and are managed separately from Grade 9 and Grade 10.
            </p>
            <p>
              Grade 8 students are enrolled in foundational core courses. Stream specializations will be confirmed during academic counseling prior to Grade 9 entry. Grade 9 stream rules do not automatically apply to Grade 8.
            </p>
            <div class="foundation-tag-list">
              <span class="foundation-tag">Foundation Mathematics</span>
              <span class="foundation-tag">Foundation English</span>
              <span class="foundation-tag">General Science</span>
              <span class="foundation-tag">Urdu / National Language</span>
              <span class="foundation-tag">Islamiyat</span>
              <span class="foundation-tag">Pakistan Studies</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Grade 9 & Grade 10 Approved Subject Selection Container -->
      <div id="igcseGrade910Container${suffix}" class="igcseGrade910Container" style="display:none;">

        <!-- Grade 10 Special Admission & Examination Conditions -->
        <div id="igcseGrade10SpecialSection${suffix}" class="igcseGrade10SpecialSection grade10-special-container" style="display:none;">
          <div class="grade10-header">
            <div class="grade10-title">
              <span class="g10-badge-icon">🎓</span>
              <div>
                <strong>Grade 10 Examination &amp; Admission Conditions</strong>
                <div class="grade10-sub">Specific evaluation and scheduling requirements for Grade 10 candidates</div>
              </div>
            </div>
          </div>

          <div class="g10-fields-grid">
            <!-- 1. Examination Board -->
            <div class="g10-field-group">
              <div class="label" style="font-weight:700;">1. Examination Board: <span class="req-star">*</span></div>
              <div class="g10-radio-row">
                <label class="radio-card g10-mini-card" id="card_board_cambridge${suffix}">
                  <input type="radio" name="g10_exam_board${radioSuffix}" value="Cambridge" id="board_cambridge${suffix}">
                  <strong>Cambridge</strong>
                </label>
                <label class="radio-card g10-mini-card" id="card_board_edexcel${suffix}">
                  <input type="radio" name="g10_exam_board${radioSuffix}" value="Pearson Edexcel" id="board_edexcel${suffix}">
                  <strong>Pearson Edexcel</strong>
                </label>
              </div>
              <div class="validation-msg" id="validation_g10_board${suffix}" style="display:none;"></div>
              <div class="g10-field-hint">Please select your registered or intended exam board.</div>
            </div>

            <!-- 2. Appearing Year & 3. Examination Session -->
            <div class="g10-field-group">
              <div class="grid cols-2" style="gap:10px;">
                <div>
                  <div class="label" style="font-weight:700;">2. Appearing Year: <span class="req-star">*</span></div>
                  <select id="g10AppearingYear${suffix}" class="input g10AppearingYear" style="min-height:38px; padding:6px 10px;">
                    <option value="">Select Examination Year</option>
                    ${yearOptions}
                  </select>
                  <div class="validation-msg" id="validation_g10_year${suffix}" style="display:none;"></div>
                </div>
                <div>
                  <div class="label" style="font-weight:700;">3. Examination Session: <span class="req-star">*</span></div>
                  <div class="g10-radio-row" style="margin-top:2px;">
                    <label class="radio-card g10-mini-card" id="card_session_may_june${suffix}">
                      <input type="radio" name="g10_exam_session${radioSuffix}" value="May/June" id="session_may_june${suffix}">
                      <span>May/June</span>
                    </label>
                    <label class="radio-card g10-mini-card" id="card_session_oct_nov${suffix}">
                      <input type="radio" name="g10_exam_session${radioSuffix}" value="October/November" id="session_oct_nov${suffix}">
                      <span>Oct/Nov</span>
                    </label>
                  </div>
                  <div class="validation-msg" id="validation_g10_session${suffix}" style="display:none;"></div>
                </div>
              </div>
            </div>

            <!-- 4. Syllabus Preparation -->
            <div class="g10-field-group">
              <div class="label" style="font-weight:700;">4. Syllabus Preparation Status: <span class="req-star">*</span></div>
              <div class="g10-radio-row cols-3">
                <label class="radio-card g10-mini-card" id="card_prep_completed${suffix}">
                  <input type="radio" name="g10_syllabus_prep${radioSuffix}" value="Syllabus completed" id="prep_completed${suffix}">
                  <span>Syllabus completed</span>
                </label>
                <label class="radio-card g10-mini-card" id="card_prep_partial${suffix}">
                  <input type="radio" name="g10_syllabus_prep${radioSuffix}" value="Partially completed" id="prep_partial${suffix}">
                  <span>Partially completed</span>
                </label>
                <label class="radio-card g10-mini-card" id="card_prep_not_completed${suffix}">
                  <input type="radio" name="g10_syllabus_prep${radioSuffix}" value="Not yet completed" id="prep_not_completed${suffix}">
                  <span>Not yet completed</span>
                </label>
              </div>
              <div class="validation-msg" id="validation_g10_prep${suffix}" style="display:none;"></div>
            </div>

            <!-- 5. Previous Examination Information -->
            <div class="g10-field-group">
              <div class="label" style="font-weight:700;">5. Previous Examination Information (Grade 9):</div>
              <div style="margin-bottom:10px;">
                <div class="g10-sublabel">Subjects already examined in Grade 9 (Check all that apply):</div>
                <div class="g10-checkbox-grid">
                  <label class="g10-check-item">
                    <input type="checkbox" name="g10_grade9_subjects${radioSuffix}" value="Urdu" id="g9_sub_urdu${suffix}">
                    <span>Urdu</span>
                  </label>
                  <label class="g10-check-item">
                    <input type="checkbox" name="g10_grade9_subjects${radioSuffix}" value="Islamiyat" id="g9_sub_islamiyat${suffix}">
                    <span>Islamiyat</span>
                  </label>
                  <label class="g10-check-item">
                    <input type="checkbox" name="g10_grade9_subjects${radioSuffix}" value="Pakistan Studies" id="g9_sub_pak_studies${suffix}">
                    <span>Pakistan Studies</span>
                  </label>
                  <label class="g10-check-item">
                    <input type="checkbox" name="g10_grade9_subjects${radioSuffix}" value="English" id="g9_sub_english${suffix}">
                    <span>English</span>
                  </label>
                  <label class="g10-check-item">
                    <input type="checkbox" name="g10_grade9_subjects${radioSuffix}" value="None yet" id="g9_sub_none${suffix}">
                    <span>None yet / First-time candidate</span>
                  </label>
                </div>
                <div style="margin-top:6px;">
                  <input type="text" id="g10OtherExaminedSubjects${suffix}" class="input g10OtherExaminedSubjects" placeholder="Other subjects already examined (if any, e.g. Mathematics)" style="font-size:12px; min-height:34px; padding:6px 10px;">
                </div>
                <div class="validation-msg" id="validation_g10_prev_exam${suffix}" style="display:none;"></div>
              </div>

              <div style="margin-bottom:10px;">
                <div class="g10-sublabel">English Examination Status:</div>
                <div class="g10-radio-row cols-3">
                  <label class="radio-card g10-mini-card selected" id="card_eng_stat_pending${suffix}">
                    <input type="radio" name="g10_english_status${radioSuffix}" value="Appearing in Grade 10" id="eng_stat_pending${suffix}" checked>
                    <span>Appearing in Grade 10</span>
                  </label>
                  <label class="radio-card g10-mini-card" id="card_eng_stat_done${suffix}">
                    <input type="radio" name="g10_english_status${radioSuffix}" value="Already examined in Grade 9" id="eng_stat_done${suffix}">
                    <span>Examined in Grade 9</span>
                  </label>
                  <label class="radio-card g10-mini-card" id="card_eng_stat_awaited${suffix}">
                    <input type="radio" name="g10_english_status${radioSuffix}" value="Result awaited" id="eng_stat_awaited${suffix}">
                    <span>Result awaited</span>
                  </label>
                </div>
              </div>

              <div>
                <div class="g10-sublabel">Applicable Subject Exemptions:</div>
                <div class="g10-radio-row">
                  <label class="radio-card g10-mini-card selected" id="card_g10_exempt_none${suffix}">
                    <input type="radio" name="g10_exempt_option${radioSuffix}" value="No exemptions (Standard curriculum)" id="g10_exempt_none${suffix}" checked>
                    <span>No exemptions (Standard curriculum)</span>
                  </label>
                  <label class="radio-card g10-mini-card" id="card_g10_exempt_applied${suffix}">
                    <input type="radio" name="g10_exempt_option${radioSuffix}" value="Exemption requested / approved under IBCC rules" id="g10_exempt_applied${suffix}">
                    <span>Exemption requested / approved (IBCC)</span>
                  </label>
                </div>
                <div id="g10ExemptionNoteWrap${suffix}" class="g10ExemptionNoteWrap" style="display:none; margin-top:6px;">
                  <input type="text" id="g10ExemptionDetails${suffix}" class="input g10ExemptionDetails" placeholder="Specify exemption details (e.g., Overseas IBCC exemption for Urdu/Islamiyat)" style="font-size:12px; min-height:34px; padding:6px 10px;">
                </div>
              </div>
            </div>

            <!-- Dynamic Admission Condition & Evaluation Result Box -->
            <div id="g10AdmissionEvaluationBox${suffix}" class="g10-eval-box g10AdmissionEvaluationBox" style="display:none;">
              <div class="g10-eval-header">
                <span class="g10-status-badge g10EvalStatusBadge" id="g10EvalStatusBadge${suffix}">Evaluation Pending</span>
                <strong class="g10-eval-title g10EvalTitle" id="g10EvalTitle${suffix}">—</strong>
              </div>
              <p class="g10-eval-msg g10EvalMessage" id="g10EvalMessage${suffix}"></p>
              <div class="g10-outcomes-wrap g10OutcomesWrap" id="g10OutcomesWrap${suffix}" style="display:none;">
                <strong>Possible Academic Committee Recommendations:</strong>
                <ul class="g10-outcomes-list g10OutcomesList" id="g10OutcomesList${suffix}"></ul>
              </div>

              <!-- Counseling Information Card -->
              <div class="g10-counseling-card g10CounselingCard" id="g10CounselingCard${suffix}" style="display:none;">
                <div class="counseling-title">
                  <span>📞</span>
                  <strong>Academic Counseling &amp; Assessment Schedule</strong>
                </div>
                <div class="counseling-details">
                  <div><strong>Available Days:</strong> Monday, Tuesday, Thursday, Friday, Saturday <span class="counseling-tag">(Excluding Wednesdays)</span></div>
                  <div><strong>Counseling Window:</strong> 12:00 PM to 2:00 PM <span class="counseling-tag">Pakistan Standard Time (PKT)</span></div>
                  <div class="counseling-note">
                    <em>Note:</em> Admission evaluation is conducted during these counseling hours. Our academic team will contact you for assessment.
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>

        <!-- 1. Compulsory Subjects -->
        <div class="igcse-block">
          <div class="igcse-block-title">
            <span class="step-num">1</span> Compulsory Subjects
          </div>
          <p class="igcse-block-intro">
            Mathematics is compulsory and automatically selected. Choose exactly ONE compulsory English syllabus.
          </p>

          <div class="math-compulsory-card">
            <div class="compulsory-check-icon">✓</div>
            <div class="compulsory-details">
              <strong id="mathTitle${suffix}">Mathematics (Compulsory)</strong>
              <div class="compulsory-note">Compulsory Subject — Automatically Selected &amp; Assigned</div>
            </div>
            <span class="badge-assigned">Auto Selected</span>
          </div>

          <!-- English Choice -->
          <div class="english-choice-section">
            <div class="label" style="font-weight:700; margin-bottom:8px; font-size:13px;">
              Select English Syllabus (Choose exactly ONE): <span class="req-star">*</span>
            </div>
            <div class="radio-card-group">
              <label class="radio-card" id="card_eng_first${suffix}">
                <div class="radio-head">
                  <input type="radio" name="igcse_english${radioSuffix}" value="English as a First Language" id="eng_first${suffix}">
                  <span class="radio-title">English as a First Language</span>
                </div>
                <p class="radio-desc">
                  Suitable for students who have a strong command of English, good vocabulary, excellent reading and writing skills, and the ability to express ideas confidently and effectively.
                </p>
              </label>

              <label class="radio-card" id="card_eng_second${suffix}">
                <div class="radio-head">
                  <input type="radio" name="igcse_english${radioSuffix}" value="English as a Second Language" id="eng_second${suffix}">
                  <span class="radio-title">English as a Second Language</span>
                </div>
                <p class="radio-desc">
                  Suitable for students who have learned English as an additional language and wish to develop their reading, writing, comprehension and communication skills.
                </p>
              </label>
            </div>
            <div class="validation-msg" id="validation_english${suffix}" style="display:none;"></div>
          </div>
        </div>

        <!-- 2. Academic Streams -->
        <div class="igcse-block">
          <div class="igcse-block-title">
            <span class="step-num">2</span> Academic Stream Selection <span class="req-star">*</span>
          </div>
          <p class="igcse-block-intro">
            Parents must choose exactly ONE complete academic stream. Once a stream is selected, all belonging subjects are automatically assigned. Subjects from different streams cannot be mixed.
          </p>

          <div class="streams-grid">
            <!-- Pure Sciences -->
            <div class="stream-card" id="stream_card_pure_sciences${suffix}" data-stream="pure_sciences">
              <div class="stream-card-head">
                <label class="stream-radio-label">
                  <input type="radio" name="igcse_stream${radioSuffix}" value="pure_sciences" id="stream_pure_sciences${suffix}">
                  <span class="stream-name">Pure Sciences</span>
                </label>
              </div>
              <ul class="stream-subject-list">
                <li>Biology</li>
                <li>Physics</li>
                <li>Chemistry</li>
              </ul>
            </div>

            <!-- IT & Engineering -->
            <div class="stream-card" id="stream_card_it_engineering${suffix}" data-stream="it_engineering">
              <div class="stream-card-head">
                <label class="stream-radio-label">
                  <input type="radio" name="igcse_stream${radioSuffix}" value="it_engineering" id="stream_it_engineering${suffix}">
                  <span class="stream-name">IT &amp; Engineering</span>
                </label>
              </div>
              <ul class="stream-subject-list">
                <li>Computer Science</li>
                <li>Physics</li>
                <li>Chemistry</li>
              </ul>
            </div>

            <!-- Commerce -->
            <div class="stream-card" id="stream_card_commerce${suffix}" data-stream="commerce">
              <div class="stream-card-head">
                <label class="stream-radio-label">
                  <input type="radio" name="igcse_stream${radioSuffix}" value="commerce" id="stream_commerce${suffix}">
                  <span class="stream-name">Commerce</span>
                </label>
              </div>
              <ul class="stream-subject-list">
                <li>Business Studies</li>
                <li>Accounting</li>
                <li>Economics</li>
              </ul>
            </div>

            <!-- Humanities (Available from 2027-2028) -->
            <div class="stream-card" id="stream_card_humanities${suffix}" data-stream="humanities">
              <div class="stream-card-head">
                <label class="stream-radio-label">
                  <input type="radio" name="igcse_stream${radioSuffix}" value="humanities" id="stream_humanities${suffix}">
                  <span class="stream-name">Humanities</span>
                </label>
                <span class="session-badge" id="humanitiesSessionBadge${suffix}">Available 2027–2028</span>
              </div>
              <ul class="stream-subject-list">
                <li>Business Studies</li>
                <li>Computer Science</li>
                <li>Psychology</li>
                <li>Sociology</li>
              </ul>
              <div class="stream-unavailable-msg" id="humanitiesUnavailableMsg${suffix}">
                Humanities stream is available starting from academic session 2027–2028 and is not currently open for selection.
              </div>
            </div>
          </div>
          <div class="validation-msg" id="validation_stream${suffix}" style="display:none;"></div>

          <!-- Assigned Stream Subjects Panel -->
          <div class="assigned-stream-panel" id="assignedStreamPanel${suffix}" style="display:none;">
            <div class="assigned-stream-head">
              <strong>Assigned Subjects for <span id="assignedStreamName${suffix}">—</span>:</strong>
              <span class="stream-rule-tag">Complete Stream Assigned • No Mixing Allowed</span>
            </div>
            <div class="subject-pills" id="assignedStreamPills${suffix}"></div>
          </div>
        </div>

        <!-- 3. Additional Optional Computer Science -->
        <div class="igcse-block" id="optCsBlock${suffix}" style="display:none;">
          <div class="igcse-block-title">
            <span class="step-num">3</span> Additional Optional Subject
          </div>
          <div class="optional-cs-card">
            <label class="checkbox-label" style="display:flex; align-items:flex-start; gap:10px; cursor:pointer;">
              <input type="checkbox" id="optCsCheckbox${suffix}" name="igcse_optional_cs${radioSuffix}" value="Computer Science" style="transform:scale(1.2); margin-top:3px;">
              <div>
                <strong>Request Computer Science as an Additional Optional Subject</strong>
                <div class="opt-cs-status-note">
                  <span class="note-highlight">Subject to school approval and availability.</span>
                  <div style="font-size:12px; color:#64748b; margin-top:3px;">
                    Tracked as an optional subject request, not an automatically approved subject.
                  </div>
                </div>
              </div>
            </label>
          </div>
        </div>

        <!-- 4. Urdu, Islamiyat, and Pakistan Studies -->
        <div class="igcse-block" id="igcsePakPathwaySection${suffix}">
          <div class="igcse-block-title">
            <span class="step-num">4</span> Urdu, Islamiyat &amp; Pakistan Studies
          </div>
          <div class="pathway-card">
            <p class="pathway-description">
              These subjects are compulsory for students following the Pakistani examination and equivalence pathway, subject to applicable requirements. Students examining outside Pakistan may qualify for exemptions according to applicable IBCC requirements. Exemptions cannot be determined based on nationality alone.
            </p>

            <div class="pathway-choice-group">
              <label class="radio-card pathway-option selected" id="card_pathway_pak${suffix}">
                <div class="radio-head">
                  <input type="radio" name="igcse_pathway${radioSuffix}" value="pakistan" id="pathway_pak${suffix}" checked>
                  <span class="radio-title">Appearing in Pakistan / Pakistani Equivalence (IBCC) Required</span>
                </div>
                <div class="radio-desc">
                  Urdu, Islamiyat, and Pakistan Studies are compulsory and scheduled for examination in Grade 9.
                </div>
                <div class="pathway-subjects-badges" id="pakPathwayAssignedBadges${suffix}" style="margin-top:8px;">
                  <span class="subject-pill">Urdu (Compulsory - Grade 9)</span>
                  <span class="subject-pill">Islamiyat (Compulsory - Grade 9)</span>
                  <span class="subject-pill">Pakistan Studies (Compulsory - Grade 9)</span>
                </div>
              </label>

              <label class="radio-card pathway-option" id="card_pathway_overseas${suffix}">
                <div class="radio-head">
                  <input type="radio" name="igcse_pathway${radioSuffix}" value="overseas_exemption" id="pathway_overseas${suffix}">
                  <span class="radio-title">Examining Outside Pakistan — Requesting IBCC Exemption</span>
                </div>
                <div class="radio-desc">
                  Student will examine outside Pakistan and requests formal academic exemption under applicable IBCC regulations.
                </div>
              </label>
            </div>

            <!-- Exemption Details Box -->
            <div class="exemption-box" id="exemptionDetailsBox${suffix}" style="display:none; margin-top:12px;">
              <div class="exemption-header">
                <span class="exemption-badge-tag">Exemption Request: Pending Academic Verification</span>
              </div>
              <p style="font-size:12px; color:#475569; margin:6px 0 10px;">
                Select the subjects for which an exemption is requested. In accordance with IBCC regulations, exemption requests are recorded as pending academic verification and evaluation of overseas examination documents. Nationality alone does not determine exemption.
              </p>
              <div class="exemption-checkboxes">
                <label class="exemption-check-item">
                  <input type="checkbox" id="exemptUrdu${suffix}" name="igcse_exemption_subject${radioSuffix}" value="Urdu">
                  Request Exemption for Urdu
                </label>
                <label class="exemption-check-item">
                  <input type="checkbox" id="exemptIslamiyat${suffix}" name="igcse_exemption_subject${radioSuffix}" value="Islamiyat">
                  Request Exemption for Islamiyat (Subject to IBCC non-Muslim / overseas criteria)
                </label>
                <label class="exemption-check-item">
                  <input type="checkbox" id="exemptPakStudies${suffix}" name="igcse_exemption_subject${radioSuffix}" value="Pakistan Studies">
                  Request Exemption for Pakistan Studies
                </label>
              </div>
              <div class="exemption-alert-note">
                <strong>Verification Notice:</strong> All exemption requests are reviewed individually by the IVS Academic Committee as per IBCC guidelines. Relevant academic records and proof of examination location will be verified prior to final Cambridge exam entry.
              </div>
            </div>
          </div>
        </div>

        <!-- 5. Real-Time Subject Selection Overview -->
        <div class="igcse-selection-summary" id="igcseLiveSummary${suffix}" style="display:none;">
          <div class="summary-head">
            <strong>Selected IGCSE Academic Package Overview</strong>
            <span class="total-subjects-badge" id="totalSubjectsBadge${suffix}">0 Subjects Selected</span>
          </div>
          <div class="summary-content-grid" id="igcseSummaryDetails${suffix}"></div>
        </div>

      </div>
    </div>
  `;
}

/* Update stream availability based on active academic session for a specific child */
function applySessionRulesToStreamsForChild(childId, containerEl) {
  const root = containerEl || document.getElementById(childId === "main" ? "igcseSubjectSection" : `academicContainer_${childId}`);
  if (!root) return;

  const state = getChildAcademicState(childId);
  const humanitiesCard = getChildElement(childId, "stream_card_humanities", root);
  const humanitiesRadio = getChildElement(childId, "stream_humanities", root);
  const humanitiesMsg = getChildElement(childId, "humanitiesUnavailableMsg", root);
  const sessionBadge = getChildElement(childId, "humanitiesSessionBadge", root);

  if (!humanitiesCard || !humanitiesRadio) return;

  const isHumanitiesAvailable = IGCSE_CONFIG.sessionConfig.isSessionAvailable("2027-2028");

  if (isHumanitiesAvailable) {
    humanitiesRadio.disabled = false;
    humanitiesCard.classList.remove("disabled");
    if (humanitiesMsg) humanitiesMsg.style.display = "none";
    if (sessionBadge) {
      sessionBadge.textContent = "Available";
      sessionBadge.style.background = "#ecfdf5";
      sessionBadge.style.color = "#065f46";
      sessionBadge.style.borderColor = "#a7f3d0";
    }
  } else {
    // If currently selected, clear selection
    if (state.stream === "humanities") {
      humanitiesRadio.checked = false;
      state.stream = "";
      state.streamSubjects = [];
      humanitiesCard.classList.remove("selected");
      const assignedPanel = getChildElement(childId, "assignedStreamPanel", root);
      if (assignedPanel) assignedPanel.style.display = "none";
    }
    humanitiesRadio.disabled = true;
    humanitiesCard.classList.add("disabled");
    humanitiesCard.classList.remove("selected");
    if (humanitiesMsg) humanitiesMsg.style.display = "block";
    if (sessionBadge) {
      sessionBadge.textContent = "Available 2027–2028";
      sessionBadge.style.background = "#fef2f2";
      sessionBadge.style.color = "#b41f2d";
      sessionBadge.style.borderColor = "#fecaca";
    }
  }
}

/* Populate Grade 10 Appearing Years dropdown dynamically for a specific child */
function populateGrade10AppearingYearsForChild(childId, containerEl) {
  const root = containerEl || document.getElementById(childId === "main" ? "igcseSubjectSection" : `academicContainer_${childId}`);
  if (!root) return;
  const select = getChildElement(childId, "g10AppearingYear", root);
  if (!select) return;
  const currentVal = select.value;
  const years = IGCSE_CONFIG.grade10Rules.getAppearingYears();
  select.innerHTML = '<option value="">Select Examination Year</option>' +
    years.map((y) => `<option value="${y}">${y}</option>`).join("");
  if (currentVal && years.includes(currentVal)) {
    select.value = currentVal;
  }
}

/* Evaluate Grade 10 Admission Conditions dynamically for a specific child */
function evaluateChildGrade10AdmissionConditions(childId, containerEl) {
  const state = getChildAcademicState(childId);
  const root = containerEl || document.getElementById(childId === "main" ? "igcseSubjectSection" : `academicContainer_${childId}`);

  const year = state.grade10.appearingYear;
  const session = state.grade10.examSession;

  if (!year || !session) {
    state.grade10.admissionStatus = "";
    state.grade10.evaluationDetails = null;
    const evalBox = root ? getChildElement(childId, "g10AdmissionEvaluationBox", root) : null;
    if (evalBox) evalBox.style.display = "none";
    return;
  }

  const policy = IGCSE_CONFIG.grade10Rules.evaluate(year, session);
  if (!policy) {
    state.grade10.admissionStatus = "";
    state.grade10.evaluationDetails = null;
    const evalBox = root ? getChildElement(childId, "g10AdmissionEvaluationBox", root) : null;
    if (evalBox) evalBox.style.display = "none";
    return;
  }

  state.grade10.admissionStatus = policy.status;
  state.grade10.evaluationDetails = policy;

  if (!root) return;

  const evalBox = getChildElement(childId, "g10AdmissionEvaluationBox", root);
  const badge = getChildElement(childId, "g10EvalStatusBadge", root);
  const title = getChildElement(childId, "g10EvalTitle", root);
  const msg = getChildElement(childId, "g10EvalMessage", root);
  const outcomesWrap = getChildElement(childId, "g10OutcomesWrap", root);
  const outcomesList = getChildElement(childId, "g10OutcomesList", root);
  const counselingCard = getChildElement(childId, "g10CounselingCard", root);

  if (badge) {
    badge.textContent = policy.status;
    badge.className = `g10-status-badge ${policy.statusType || "info"}`;
  }
  if (evalBox) {
    evalBox.className = `g10-eval-box ${policy.statusType || "info"}`;
  }
  if (title) title.textContent = policy.title;
  if (msg) msg.textContent = policy.message;

  if (policy.possibleOutcomes && policy.possibleOutcomes.length && outcomesWrap && outcomesList) {
    outcomesList.innerHTML = policy.possibleOutcomes.map((o) => `<li>${o}</li>`).join("");
    outcomesWrap.style.display = "block";
  } else if (outcomesWrap) {
    outcomesWrap.style.display = "none";
  }

  if (counselingCard) {
    counselingCard.style.display = policy.showCounseling ? "block" : "none";
  }

  if (evalBox) evalBox.style.display = "block";
}

/* Clear Grade 10 data for a specific child */
function clearChildGrade10Data(childId, containerEl) {
  const state = getChildAcademicState(childId);
  const root = containerEl || document.getElementById(childId === "main" ? "igcseSubjectSection" : `academicContainer_${childId}`);
  if (!root) return;

  const g10Section = getChildElement(childId, "igcseGrade10SpecialSection", root);
  if (g10Section) g10Section.style.display = "none";

  // Reset exam board radios
  scopedQueryAll(root, `input[name="${getRadioName('g10_exam_board', childId)}"]`).forEach((r) => (r.checked = false));
  getChildElement(childId, "card_board_cambridge", root)?.classList.remove("selected");
  getChildElement(childId, "card_board_edexcel", root)?.classList.remove("selected");

  // Reset appearing year
  const yearSelect = getChildElement(childId, "g10AppearingYear", root);
  if (yearSelect) yearSelect.value = "";

  // Reset session radios
  scopedQueryAll(root, `input[name="${getRadioName('g10_exam_session', childId)}"]`).forEach((r) => (r.checked = false));
  getChildElement(childId, "card_session_may_june", root)?.classList.remove("selected");
  getChildElement(childId, "card_session_oct_nov", root)?.classList.remove("selected");

  // Reset syllabus prep radios
  scopedQueryAll(root, `input[name="${getRadioName('g10_syllabus_prep', childId)}"]`).forEach((r) => (r.checked = false));
  getChildElement(childId, "card_prep_completed", root)?.classList.remove("selected");
  getChildElement(childId, "card_prep_partial", root)?.classList.remove("selected");
  getChildElement(childId, "card_prep_not_completed", root)?.classList.remove("selected");

  // Reset Grade 9 examined subjects checkboxes & text
  scopedQueryAll(root, `input[name="${getRadioName('g10_grade9_subjects', childId)}"]`).forEach((cb) => (cb.checked = false));
  const otherSubs = getChildElement(childId, "g10OtherExaminedSubjects", root);
  if (otherSubs) otherSubs.value = "";

  // Reset English status radios
  const engPending = getChildElement(childId, "eng_stat_pending", root);
  if (engPending) engPending.checked = true;
  getChildElement(childId, "card_eng_stat_pending", root)?.classList.add("selected");
  getChildElement(childId, "card_eng_stat_done", root)?.classList.remove("selected");
  getChildElement(childId, "card_eng_stat_awaited", root)?.classList.remove("selected");

  // Reset Exemptions option radios & text
  const exemptNone = getChildElement(childId, "g10_exempt_none", root);
  if (exemptNone) exemptNone.checked = true;
  getChildElement(childId, "card_g10_exempt_none", root)?.classList.add("selected");
  getChildElement(childId, "card_g10_exempt_applied", root)?.classList.remove("selected");
  const exemptWrap = getChildElement(childId, "g10ExemptionNoteWrap", root);
  if (exemptWrap) exemptWrap.style.display = "none";
  const exemptDetails = getChildElement(childId, "g10ExemptionDetails", root);
  if (exemptDetails) exemptDetails.value = "";

  // Hide evaluation box
  const evalBox = getChildElement(childId, "g10AdmissionEvaluationBox", root);
  if (evalBox) evalBox.style.display = "none";

  state.grade10 = {
    examBoard: "",
    appearingYear: "",
    examSession: "",
    syllabusPrep: "",
    grade9ExaminedSubjects: [],
    grade9ExaminedOther: "",
    englishExamStatus: "Appearing in Grade 10",
    exemptionsStatus: "No exemptions (Standard curriculum)",
    exemptionDetails: "",
    admissionStatus: "",
    evaluationDetails: null
  };
}

/* Reset Grade 9/10 fields without hiding whole section */
function resetChildGrade910FieldsOnly(childId, containerEl) {
  clearChildGrade10Data(childId, containerEl);
  const state = getChildAcademicState(childId);
  const root = containerEl || document.getElementById(childId === "main" ? "igcseSubjectSection" : `academicContainer_${childId}`);
  if (!root) return;

  // English
  scopedQueryAll(root, `input[name="${getRadioName('igcse_english', childId)}"]`).forEach((r) => (r.checked = false));
  getChildElement(childId, "card_eng_first", root)?.classList.remove("selected");
  getChildElement(childId, "card_eng_second", root)?.classList.remove("selected");
  state.englishChoice = "";

  // Streams
  scopedQueryAll(root, `input[name="${getRadioName('igcse_stream', childId)}"]`).forEach((r) => (r.checked = false));
  scopedQueryAll(root, ".stream-card").forEach((c) => c.classList.remove("selected"));
  state.stream = "";
  state.streamSubjects = [];

  const assignedPanel = getChildElement(childId, "assignedStreamPanel", root);
  if (assignedPanel) assignedPanel.style.display = "none";

  // Optional CS
  const optCsBlock = getChildElement(childId, "optCsBlock", root);
  const optCsCheckbox = getChildElement(childId, "optCsCheckbox", root);
  if (optCsBlock) optCsBlock.style.display = "none";
  if (optCsCheckbox) optCsCheckbox.checked = false;
  state.optionalCsRequested = false;

  // Pathway
  const pakRadio = getChildElement(childId, "pathway_pak", root);
  if (pakRadio) pakRadio.checked = true;
  getChildElement(childId, "card_pathway_pak", root)?.classList.add("selected");
  getChildElement(childId, "card_pathway_overseas", root)?.classList.remove("selected");
  const exemptionDetailsBox = getChildElement(childId, "exemptionDetailsBox", root);
  if (exemptionDetailsBox) exemptionDetailsBox.style.display = "none";
  scopedQueryAll(root, `input[name="${getRadioName('igcse_exemption_subject', childId)}"]`).forEach((cb) => (cb.checked = false));
  state.pathway = "pakistan";
  state.exemptions = { urdu: false, islamiyat: false, pakStudies: false };

  // Live Summary
  const liveSummary = getChildElement(childId, "igcseLiveSummary", root);
  if (liveSummary) liveSummary.style.display = "none";
}

/* Clear all IGCSE selections and reset state completely for a child */
function clearChildAcademicState(childId, containerEl) {
  const id = String(childId || "main");
  resetChildGrade910FieldsOnly(id, containerEl);

  const root = containerEl || document.getElementById(id === "main" ? "igcseSubjectSection" : `academicContainer_${id}`);
  if (root) {
    const g8Container = getChildElement(id, "igcseGrade8Container", root);
    const g910Container = getChildElement(id, "igcseGrade910Container", root);
    const g10Special = getChildElement(id, "igcseGrade10SpecialSection", root);
    if (g8Container) g8Container.style.display = "none";
    if (g910Container) g910Container.style.display = "none";
    if (g10Special) g10Special.style.display = "none";
  }

  const state = getChildAcademicState(id);
  state.currentGradeRaw = "";
  state.gradeLevel = null;
  state.curriculum = null;
  state.isEligible = false;
  state.validationErrors = {};
  displayChildValidationErrors(id, {});

  if (id === "main") {
    igcseState.currentGradeRaw = "";
    igcseState.gradeLevel = null;
    igcseState.curriculum = null;
    igcseState.isEligible = false;
  }
}

/* Handler for Child Grade Change */
function handleChildGradeChange(childId, gradeSelectEl, containerEl) {
  const id = String(childId || "main");
  const select = gradeSelectEl || (id === "main" ? document.getElementById("gradeSelect") : document.getElementById(`childGrade_${id}`));
  if (!select) return;

  const info = detectGradeAndCurriculum(select);
  const state = getChildAcademicState(id);

  state.currentGradeRaw = info.raw;
  state.curriculum = info.curriculum;
  state.gradeLevel = info.gradeLevel;
  state.isEligible = info.isEligible;

  if (id === "main") {
    igcseState.currentGradeRaw = info.raw;
    igcseState.curriculum = info.curriculum;
    igcseState.gradeLevel = info.gradeLevel;
    igcseState.isEligible = info.isEligible;
  }

  const root = containerEl || document.getElementById(id === "main" ? "igcseSubjectSection" : `academicContainer_${id}`);
  if (!root) return;

  const g8Container = getChildElement(id, "igcseGrade8Container", root);
  const g910Container = getChildElement(id, "igcseGrade910Container", root);
  const g10Special = getChildElement(id, "igcseGrade10SpecialSection", root);

  if (!info.isEligible) {
    root.style.display = "none";
    resetChildGrade910FieldsOnly(id, root);
    state.validationErrors = {};
    displayChildValidationErrors(id, {});
    if (typeof window.generateSummaryHTML === "function") window.generateSummaryHTML();
    return;
  }

  root.style.display = "block";

  if (info.gradeLevel === 8) {
    if (g8Container) g8Container.style.display = "block";
    if (g910Container) g910Container.style.display = "none";
    if (g10Special) g10Special.style.display = "none";
    resetChildGrade910FieldsOnly(id, root);
  } else if (info.gradeLevel === 9) {
    if (g8Container) g8Container.style.display = "none";
    if (g910Container) g910Container.style.display = "block";
    if (g10Special) g10Special.style.display = "none";
    clearChildGrade10Data(id, root);
    applySessionRulesToStreamsForChild(id, root);
  } else if (info.gradeLevel === 10) {
    if (g8Container) g8Container.style.display = "none";
    if (g910Container) g910Container.style.display = "block";
    if (g10Special) g10Special.style.display = "block";
    applySessionRulesToStreamsForChild(id, root);
    populateGrade10AppearingYearsForChild(id, root);
    evaluateChildGrade10AdmissionConditions(id, root);
  }

  updateChildLiveSummary(id, root);
  if (typeof window.generateSummaryHTML === "function") window.generateSummaryHTML();
}

/* Handler for Child English Syllabus Selection */
function handleChildEnglishSelection(childId, choice) {
  const state = getChildAcademicState(childId);
  state.englishChoice = choice;
  if (childId === "main") igcseState.englishChoice = choice;

  const root = document.getElementById(childId === "main" ? "igcseSubjectSection" : `academicContainer_${childId}`);
  if (root) {
    const cardFirst = getChildElement(childId, "card_eng_first", root);
    const cardSecond = getChildElement(childId, "card_eng_second", root);
    if (cardFirst) cardFirst.classList.toggle("selected", choice === "English as a First Language");
    if (cardSecond) cardSecond.classList.toggle("selected", choice === "English as a Second Language");

    // Clear inline error if any
    const errEl = getChildElement(childId, "validation_english", root);
    if (errEl) {
      errEl.textContent = "";
      errEl.style.display = "none";
    }
  }

  updateChildLiveSummary(childId, root);
  if (typeof window.generateSummaryHTML === "function") {
    window.generateSummaryHTML();
  }
}

/* Handler for Child Academic Stream Selection */
function handleChildStreamSelection(childId, streamKey) {
  const streamConfig = IGCSE_CONFIG.streams[streamKey];
  if (!streamConfig) return;

  const root = document.getElementById(childId === "main" ? "igcseSubjectSection" : `academicContainer_${childId}`);

  if (streamKey === "humanities" && !IGCSE_CONFIG.sessionConfig.isSessionAvailable("2027-2028")) {
    alert("The Humanities stream is available starting from academic session 2027–2028.");
    const radio = getChildElement(childId, "stream_humanities", root);
    if (radio) radio.checked = false;
    return;
  }

  const state = getChildAcademicState(childId);
  state.stream = streamKey;
  state.streamSubjects = [...streamConfig.subjects];
  if (childId === "main") {
    igcseState.stream = streamKey;
    igcseState.streamSubjects = [...streamConfig.subjects];
  }

  if (root) {
    // Highlight selected stream card
    scopedQueryAll(root, ".stream-card").forEach((card) => {
      const isThisStream = card.dataset?.stream === streamKey;
      card.classList.toggle("selected", isThisStream);
    });

    // Display assigned stream subjects panel
    const assignedPanel = getChildElement(childId, "assignedStreamPanel", root);
    const assignedName = getChildElement(childId, "assignedStreamName", root);
    const assignedPills = getChildElement(childId, "assignedStreamPills", root);

    if (assignedPanel && assignedName && assignedPills) {
      assignedName.textContent = streamConfig.name;
      assignedPills.innerHTML = streamConfig.subjects
        .map((s) => `<span class="subject-pill">${s}</span>`)
        .join("");
      assignedPanel.style.display = "block";
    }

    // Handle Additional Optional Computer Science availability
    const hasComputerScience = streamConfig.subjects.includes("Computer Science");
    const optCsBlock = getChildElement(childId, "optCsBlock", root);
    const optCsCheckbox = getChildElement(childId, "optCsCheckbox", root);

    if (hasComputerScience) {
      if (optCsBlock) optCsBlock.style.display = "none";
      if (optCsCheckbox) optCsCheckbox.checked = false;
      state.optionalCsRequested = false;
      if (childId === "main") igcseState.optionalCsRequested = false;
    } else {
      if (optCsBlock) optCsBlock.style.display = "block";
    }

    // Clear stream error message
    const errEl = getChildElement(childId, "validation_stream", root);
    if (errEl) {
      errEl.textContent = "";
      errEl.style.display = "none";
    }
  }

  updateChildLiveSummary(childId, root);
  if (typeof window.generateSummaryHTML === "function") {
    window.generateSummaryHTML();
  }
}

/* Handler for Child Optional CS Toggle */
function handleChildOptionalCsToggle(childId, isChecked) {
  const state = getChildAcademicState(childId);
  state.optionalCsRequested = Boolean(isChecked);
  if (childId === "main") igcseState.optionalCsRequested = Boolean(isChecked);

  const root = document.getElementById(childId === "main" ? "igcseSubjectSection" : `academicContainer_${childId}`);
  updateChildLiveSummary(childId, root);
  if (typeof window.generateSummaryHTML === "function") {
    window.generateSummaryHTML();
  }
}

/* Handler for Child Pakistani Pathway Radios */
function handleChildPathwaySelection(childId, pathwayValue) {
  const state = getChildAcademicState(childId);
  state.pathway = pathwayValue;
  if (childId === "main") igcseState.pathway = pathwayValue;

  const root = document.getElementById(childId === "main" ? "igcseSubjectSection" : `academicContainer_${childId}`);
  if (root) {
    const cardPak = getChildElement(childId, "card_pathway_pak", root);
    const cardOverseas = getChildElement(childId, "card_pathway_overseas", root);
    const exemptionDetailsBox = getChildElement(childId, "exemptionDetailsBox", root);

    if (pathwayValue === "pakistan") {
      if (cardPak) cardPak.classList.add("selected");
      if (cardOverseas) cardOverseas.classList.remove("selected");
      if (exemptionDetailsBox) exemptionDetailsBox.style.display = "none";

      scopedQueryAll(root, `input[name="${getRadioName('igcse_exemption_subject', childId)}"]`).forEach((cb) => {
        cb.checked = false;
      });
      state.exemptions = { urdu: false, islamiyat: false, pakStudies: false };
      if (childId === "main") igcseState.exemptions = { urdu: false, islamiyat: false, pakStudies: false };
    } else {
      if (cardPak) cardPak.classList.remove("selected");
      if (cardOverseas) cardOverseas.classList.add("selected");
      if (exemptionDetailsBox) exemptionDetailsBox.style.display = "block";
    }
  }

  updateChildLiveSummary(childId, root);
  if (typeof window.generateSummaryHTML === "function") {
    window.generateSummaryHTML();
  }
}

/* Handler for Child Exemption Checkboxes */
function handleChildExemptionChange(childId) {
  const state = getChildAcademicState(childId);
  const root = document.getElementById(childId === "main" ? "igcseSubjectSection" : `academicContainer_${childId}`);
  if (!root) return;

  const exemptUrdu = getChildElement(childId, "exemptUrdu", root)?.checked || false;
  const exemptIslamiyat = getChildElement(childId, "exemptIslamiyat", root)?.checked || false;
  const exemptPakStudies = getChildElement(childId, "exemptPakStudies", root)?.checked || false;

  state.exemptions = {
    urdu: exemptUrdu,
    islamiyat: exemptIslamiyat,
    pakStudies: exemptPakStudies
  };
  if (childId === "main") {
    igcseState.exemptions = { urdu: exemptUrdu, islamiyat: exemptIslamiyat, pakStudies: exemptPakStudies };
  }

  updateChildLiveSummary(childId, root);
  if (typeof window.generateSummaryHTML === "function") {
    window.generateSummaryHTML();
  }
}

/* Compile structured summary data of child selections */
function getChildIgcseSummaryData(childId) {
  const state = getChildAcademicState(childId);
  if (!state || !state.isEligible) return null;

  if (state.gradeLevel === 8) {
    return {
      grade: state.currentGradeRaw,
      gradeLevel: 8,
      program: "Pre-IGCSE / Foundation Program",
      status: "Stream selection pending confirmation",
      foundationSubjects: [...IGCSE_CONFIG.grades[8].foundationSubjects]
    };
  }

  const streamConfig = IGCSE_CONFIG.streams[state.stream] || null;
  const streamName = streamConfig ? streamConfig.name : "None selected";
  const streamSubjects = streamConfig ? [...streamConfig.subjects] : [];

  const mathTitle = getMathSubjectTitle(state.grade10?.examBoard);
  const compulsorySubjects = [mathTitle];
  if (state.englishChoice) {
    compulsorySubjects.push(state.englishChoice);
  }

  const optionalSubjects = [];
  if (state.optionalCsRequested) {
    optionalSubjects.push({
      name: "Computer Science",
      code: "0478",
      status: "Requested (Subject to School Approval)"
    });
  }

  let pathwayInfo = {
    type: state.pathway,
    status: "Compulsory Pakistani Pathway",
    subjects: ["Urdu (Grade 9)", "Islamiyat (Grade 9)", "Pakistan Studies (Grade 9)"],
    exemptionsRequested: []
  };

  if (state.pathway === "overseas_exemption") {
    const requested = [];
    if (state.exemptions.urdu) requested.push("Urdu");
    if (state.exemptions.islamiyat) requested.push("Islamiyat");
    if (state.exemptions.pakStudies) requested.push("Pakistan Studies");

    pathwayInfo = {
      type: "overseas_exemption",
      status: requested.length ? "Exemption Requested — Pending Academic Verification" : "Overseas Pathway (No exemptions selected)",
      subjects: ["Urdu", "Islamiyat", "Pakistan Studies"].filter((s) => !requested.includes(s)),
      exemptionsRequested: requested
    };
  }

  let totalCount = 1; // Mathematics
  if (state.englishChoice) totalCount += 1;
  totalCount += streamSubjects.length;
  if (state.optionalCsRequested) totalCount += 1;
  totalCount += pathwayInfo.subjects.length;

  const result = {
    grade: state.currentGradeRaw,
    gradeLevel: state.gradeLevel,
    compulsorySubjects,
    englishChoice: state.englishChoice || "Pending Selection",
    stream: streamName,
    streamSubjects,
    optionalSubjects,
    pathway: pathwayInfo,
    totalSubjectsCount: totalCount
  };

  // Grade 10 Special Admission Evaluation Details (Phase 2)
  if (state.gradeLevel === 10) {
    result.grade10Admission = {
      examBoard: state.grade10.examBoard || "Pending Selection",
      appearingYear: state.grade10.appearingYear || "Pending Selection",
      examSession: state.grade10.examSession || "Pending Selection",
      syllabusPreparation: state.grade10.syllabusPrep || "Pending Selection",
      grade9ExaminedSubjects: [...state.grade10.grade9ExaminedSubjects],
      grade9OtherSubjects: state.grade10.grade9ExaminedOther || "",
      englishExamStatus: state.grade10.englishExamStatus || "Appearing in Grade 10",
      exemptionsStatus: state.grade10.exemptionsStatus || "No exemptions (Standard curriculum)",
      exemptionDetails: state.grade10.exemptionDetails || "",
      admissionStatus: state.grade10.admissionStatus || "Evaluation Pending",
      evaluationDetails: state.grade10.evaluationDetails,
      counselingRequired: Boolean(state.grade10.evaluationDetails?.showCounseling)
    };
  }

  return result;
}

/* Update Real-Time Live Summary on UI for a specific child */
function updateChildLiveSummary(childId, containerEl) {
  const root = containerEl || document.getElementById(childId === "main" ? "igcseSubjectSection" : `academicContainer_${childId}`);
  if (!root) return;

  const liveSummary = getChildElement(childId, "igcseLiveSummary", root);
  const summaryDetails = getChildElement(childId, "igcseSummaryDetails", root);
  const badge = getChildElement(childId, "totalSubjectsBadge", root);

  if (!liveSummary || !summaryDetails || !badge) return;

  const state = getChildAcademicState(childId);
  if (!state.isEligible || state.gradeLevel === 8) {
    liveSummary.style.display = "none";
    return;
  }

  const data = getChildIgcseSummaryData(childId);
  if (!data) {
    liveSummary.style.display = "none";
    return;
  }

  badge.textContent = `${data.totalSubjectsCount} Subject${data.totalSubjectsCount === 1 ? "" : "s"} Selected`;

  const streamText = data.streamSubjects.length
    ? `${escapeHTML(data.stream)}: ${escapeHTML(data.streamSubjects.join(", "))}`
    : '<span style="color:#e11d48; font-style:italic;">Please choose an academic stream</span>';

  const englishText = data.englishChoice !== "Pending Selection"
    ? escapeHTML(data.englishChoice)
    : '<span style="color:#e11d48; font-style:italic;">Please choose English syllabus</span>';

  const optionalText = data.optionalSubjects.length
    ? '<span style="color:#b45309; font-weight:600;">Computer Science (Requested — Pending Approval)</span>'
    : "None";

  let pathwayText = "";
  if (data.pathway.type === "pakistan") {
    pathwayText = "Urdu, Islamiyat, Pakistan Studies (Grade 9 Compulsory Exam)";
  } else {
    if (data.pathway.exemptionsRequested.length) {
      pathwayText = `<span style="color:#ea580c; font-weight:600;">Exemption Requested for: ${escapeHTML(data.pathway.exemptionsRequested.join(", "))} (Pending Academic Verification)</span>`;
    } else {
      pathwayText = "Overseas Examination (No subject exemptions selected)";
    }
  }

  let htmlRows = `
    <div class="summary-row">
      <div class="summary-label">Compulsory Core:</div>
      <div class="summary-value">${escapeHTML(getMathSubjectTitle(data.grade10Admission?.examBoard || ""))} &bull; ${englishText}</div>
    </div>
    <div class="summary-row">
      <div class="summary-label">Selected Stream:</div>
      <div class="summary-value">${streamText}</div>
    </div>
    <div class="summary-row">
      <div class="summary-label">Optional Subject:</div>
      <div class="summary-value">${optionalText}</div>
    </div>
    <div class="summary-row">
      <div class="summary-label">Pakistani Pathway:</div>
      <div class="summary-value">${pathwayText}</div>
    </div>
  `;

  if (data.gradeLevel === 10 && data.grade10Admission) {
    const g10 = data.grade10Admission;
    const statBadge = g10.admissionStatus && g10.admissionStatus !== "Evaluation Pending"
      ? `<span class="g10-status-badge ${g10.evaluationDetails?.statusType || 'info'}">${escapeHTML(g10.admissionStatus)}</span>`
      : '<span style="color:#b45309; font-style:italic;">Select Year &amp; Session for evaluation</span>';
    const examSched = (g10.examBoard !== "Pending Selection" || g10.appearingYear !== "Pending Selection")
      ? `${g10.examBoard !== "Pending Selection" ? escapeHTML(g10.examBoard) : "Exam Board Pending"} &bull; ${g10.examSession !== "Pending Selection" ? escapeHTML(g10.examSession) : ""} ${g10.appearingYear !== "Pending Selection" ? escapeHTML(g10.appearingYear) : ""}`
      : "Schedule pending";

    htmlRows += `
      <div class="summary-row" style="border-top:1px dashed #cbd5e1; padding-top:6px; margin-top:2px;">
        <div class="summary-label">Grade 10 Admission:</div>
        <div class="summary-value">${statBadge} &bull; ${examSched}</div>
      </div>
    `;
  }

  summaryDetails.innerHTML = htmlRows;
  liveSummary.style.display = "block";
}

/* Generate concise HTML snippet for Children Summary */
function getChildIgcseSummarySnippetHTML(childId) {
  const state = getChildAcademicState(childId);
  if (!state || !state.isEligible) return "";

  if (state.gradeLevel === 8) {
    return `<div class="summary-academic-block"><strong style="color:#0284c7;">IGCSE Curriculum:</strong> Foundation Preparatory Program (Stream selection pending confirmation)</div>`;
  }

  const data = getChildIgcseSummaryData(childId);
  if (!data) return "";

  let snippet = '<div class="summary-academic-block">';

  // Examination Board (Grade 10)
  if (data.gradeLevel === 10 && data.grade10Admission) {
    const g10 = data.grade10Admission;
    if (g10.examBoard && g10.examBoard !== "Pending Selection") {
      snippet += `<div class="summary-academic-line"><strong>Examination Board:</strong> ${escapeHTML(g10.examBoard)}</div>`;
    }
  }

  // Selected English Option
  if (data.englishChoice && data.englishChoice !== "Pending Selection") {
    snippet += `<div class="summary-academic-line"><strong>Selected English Option:</strong> ${escapeHTML(data.englishChoice)}</div>`;
  }

  // Academic Stream & Stream Subjects
  if (data.stream && data.stream !== "None selected") {
    snippet += `<div class="summary-academic-line"><strong>Academic Stream:</strong> ${escapeHTML(data.stream)} (${escapeHTML(data.streamSubjects.join(", "))})</div>`;
  }

  // Additional Optional Subject Request
  if (data.optionalSubjects && data.optionalSubjects.length) {
    snippet += `<div class="summary-academic-line" style="color:#b45309;"><strong>Additional Optional Subject:</strong> Computer Science (Requested — Subject to school approval)</div>`;
  }

  // Applicable Pakistani Examination Subjects
  if (data.pathway) {
    if (data.pathway.type === "overseas_exemption" && data.pathway.exemptionsRequested.length) {
      snippet += `<div class="summary-academic-line" style="color:#ea580c;"><strong>Pakistani Examination Pathway:</strong> Exemption Requested for ${escapeHTML(data.pathway.exemptionsRequested.join(", "))} (Pending Verification)</div>`;
    } else if (data.pathway.type === "pakistan") {
      snippet += `<div class="summary-academic-line"><strong>Pakistani Examination Subjects:</strong> Urdu, Islamiyat, Pakistan Studies (Grade 9 Compulsory)</div>`;
    }
  }

  // Examination Year/Session & Academic Review Status (Grade 10)
  if (data.gradeLevel === 10 && data.grade10Admission) {
    const g10 = data.grade10Admission;
    if (g10.appearingYear !== "Pending Selection" || g10.examSession !== "Pending Selection") {
      snippet += `<div class="summary-academic-line"><strong>Examination Schedule:</strong> ${escapeHTML(g10.examSession)} ${escapeHTML(g10.appearingYear)}</div>`;
    }
    if (g10.admissionStatus && g10.admissionStatus !== "Evaluation Pending") {
      const color = g10.admissionStatus === "Academic Review Required" ? "#b45309" : "#166534";
      snippet += `<div class="summary-academic-line" style="color:${color}; font-weight:700;"><strong>Academic Review Status:</strong> ${escapeHTML(g10.admissionStatus)}</div>`;
    }
  }

  snippet += '</div>';
  return snippet;
}

/* Initialize academic component for a child (main student or additional children) */
function initChildAcademicComponent(childId, containerEl, gradeSelectEl) {
  if (!containerEl || !gradeSelectEl) return;

  const id = String(childId || "main");

  // Inject markup if empty (for dynamically cloned children)
  if (!containerEl.innerHTML.trim() || containerEl.innerHTML.trim().length < 50) {
    containerEl.innerHTML = renderAcademicSelectionHTML(id);
  }

  // Ensure state exists
  getChildAcademicState(id);

  // Bind all event listeners for this child
  bindChildAcademicEvents(id, containerEl, gradeSelectEl);

  // Populate appearing years
  populateGrade10AppearingYearsForChild(id, containerEl);

  // Trigger evaluation if grade is already selected
  if (gradeSelectEl.value) {
    handleChildGradeChange(id, gradeSelectEl, containerEl);
  }
}

/* Bind all UI events for a child component */
function bindChildAcademicEvents(childId, containerEl, gradeSelectEl) {
  if (!containerEl || !gradeSelectEl) return;
  const id = String(childId || "main");

  // React to grade changes
  const onGradeChange = () => handleChildGradeChange(id, gradeSelectEl, containerEl);
  gradeSelectEl.addEventListener("change", onGradeChange);
  gradeSelectEl.addEventListener("input", onGradeChange);

  // Wire English syllabus radios
  scopedQueryAll(containerEl, `input[name="${getRadioName('igcse_english', id)}"]`).forEach((radio) => {
    radio.addEventListener("change", (e) => {
      if (e.target.checked) handleChildEnglishSelection(id, e.target.value);
    });
  });

  // Wire Stream radios
  scopedQueryAll(containerEl, `input[name="${getRadioName('igcse_stream', id)}"]`).forEach((radio) => {
    radio.addEventListener("change", (e) => {
      if (e.target.checked) handleChildStreamSelection(id, e.target.value);
    });
  });

  // Stream card clicks (for better UX)
  scopedQueryAll(containerEl, ".stream-card").forEach((card) => {
    card.addEventListener("click", (e) => {
      if (card.classList.contains("disabled")) {
        e.preventDefault();
        return;
      }
      const radio = card.querySelector ? card.querySelector('input[type="radio"]') : null;
      if (radio && !radio.checked && !radio.disabled) {
        radio.checked = true;
        handleChildStreamSelection(id, radio.value);
      }
    });
  });

  // Wire Optional CS Checkbox
  const optCsCheckbox = getChildElement(id, "optCsCheckbox", containerEl);
  if (optCsCheckbox) {
    optCsCheckbox.addEventListener("change", (e) => {
      handleChildOptionalCsToggle(id, e.target.checked);
    });
  }

  // Wire Pakistani Pathway Radios
  scopedQueryAll(containerEl, `input[name="${getRadioName('igcse_pathway', id)}"]`).forEach((radio) => {
    radio.addEventListener("change", (e) => {
      if (e.target.checked) handleChildPathwaySelection(id, e.target.value);
    });
  });

  // Wire Exemption Checkboxes
  scopedQueryAll(containerEl, `input[name="${getRadioName('igcse_exemption_subject', id)}"]`).forEach((cb) => {
    cb.addEventListener("change", () => handleChildExemptionChange(id));
  });

  // Wire Grade 10 Exam Board radios
  scopedQueryAll(containerEl, `input[name="${getRadioName('g10_exam_board', id)}"]`).forEach((radio) => {
    radio.addEventListener("change", (e) => {
      if (e.target.checked) {
        const state = getChildAcademicState(id);
        state.grade10.examBoard = e.target.value;
        if (id === "main") igcseState.grade10.examBoard = e.target.value;

        const cardCam = getChildElement(id, "card_board_cambridge", containerEl);
        const cardEdx = getChildElement(id, "card_board_edexcel", containerEl);
        if (cardCam) cardCam.classList.toggle("selected", e.target.value === "Cambridge");
        if (cardEdx) cardEdx.classList.toggle("selected", e.target.value === "Pearson Edexcel");

        // Dynamically update Mathematics compulsory title for this child
        const mathEl = getChildElement(id, "mathTitle", containerEl);
        if (mathEl) mathEl.textContent = getMathSubjectTitle(e.target.value);

        const errEl = getChildElement(id, "validation_g10_board", containerEl);
        if (errEl) { errEl.textContent = ""; errEl.style.display = "none"; }

        updateChildLiveSummary(id, containerEl);
        if (typeof window.generateSummaryHTML === "function") window.generateSummaryHTML();
      }
    });
  });

  // Wire Grade 10 Appearing Year select
  const yearSelect = getChildElement(id, "g10AppearingYear", containerEl);
  if (yearSelect) {
    yearSelect.addEventListener("change", (e) => {
      const state = getChildAcademicState(id);
      state.grade10.appearingYear = e.target.value;
      if (id === "main") igcseState.grade10.appearingYear = e.target.value;

      const errEl = getChildElement(id, "validation_g10_year", containerEl);
      if (errEl) { errEl.textContent = ""; errEl.style.display = "none"; }

      evaluateChildGrade10AdmissionConditions(id, containerEl);
      updateChildLiveSummary(id, containerEl);
      if (typeof window.generateSummaryHTML === "function") window.generateSummaryHTML();
    });
  }

  // Wire Grade 10 Exam Session radios
  scopedQueryAll(containerEl, `input[name="${getRadioName('g10_exam_session', id)}"]`).forEach((radio) => {
    radio.addEventListener("change", (e) => {
      if (e.target.checked) {
        const state = getChildAcademicState(id);
        state.grade10.examSession = e.target.value;
        if (id === "main") igcseState.grade10.examSession = e.target.value;

        const cardMay = getChildElement(id, "card_session_may_june", containerEl);
        const cardOct = getChildElement(id, "card_session_oct_nov", containerEl);
        if (cardMay) cardMay.classList.toggle("selected", e.target.value === "May/June");
        if (cardOct) cardOct.classList.toggle("selected", e.target.value === "October/November");

        const errEl = getChildElement(id, "validation_g10_session", containerEl);
        if (errEl) { errEl.textContent = ""; errEl.style.display = "none"; }

        evaluateChildGrade10AdmissionConditions(id, containerEl);
        updateChildLiveSummary(id, containerEl);
        if (typeof window.generateSummaryHTML === "function") window.generateSummaryHTML();
      }
    });
  });

  // Wire Grade 10 Syllabus Preparation radios
  scopedQueryAll(containerEl, `input[name="${getRadioName('g10_syllabus_prep', id)}"]`).forEach((radio) => {
    radio.addEventListener("change", (e) => {
      if (e.target.checked) {
        const state = getChildAcademicState(id);
        state.grade10.syllabusPrep = e.target.value;
        if (id === "main") igcseState.grade10.syllabusPrep = e.target.value;

        const cardComp = getChildElement(id, "card_prep_completed", containerEl);
        const cardPart = getChildElement(id, "card_prep_partial", containerEl);
        const cardNot = getChildElement(id, "card_prep_not_completed", containerEl);
        if (cardComp) cardComp.classList.toggle("selected", e.target.value === "Syllabus completed");
        if (cardPart) cardPart.classList.toggle("selected", e.target.value === "Partially completed");
        if (cardNot) cardNot.classList.toggle("selected", e.target.value === "Not yet completed");

        const errEl = getChildElement(id, "validation_g10_prep", containerEl);
        if (errEl) { errEl.textContent = ""; errEl.style.display = "none"; }

        updateChildLiveSummary(id, containerEl);
        if (typeof window.generateSummaryHTML === "function") window.generateSummaryHTML();
      }
    });
  });

  // Wire Grade 9 Examined Subjects checkboxes
  const g9SubjectCheckboxes = scopedQueryAll(containerEl, `input[name="${getRadioName('g10_grade9_subjects', id)}"]`);
  g9SubjectCheckboxes.forEach((cb) => {
    cb.addEventListener("change", (e) => {
      const state = getChildAcademicState(id);
      const noneCb = Array.from(g9SubjectCheckboxes).find((c) => c.value === "None yet");

      if (e.target.value === "None yet" && e.target.checked) {
        g9SubjectCheckboxes.forEach((o) => {
          if (o.value !== "None yet") o.checked = false;
        });
        const otherSubs = getChildElement(id, "g10OtherExaminedSubjects", containerEl);
        if (otherSubs) otherSubs.value = "";

        // Contradiction prevention: reset English status if marked as examined in Grade 9
        const engPend = getChildElement(id, "eng_stat_pending", containerEl);
        if (engPend && state.grade10.englishExamStatus === "Already examined in Grade 9") {
          engPend.checked = true;
          state.grade10.englishExamStatus = "Appearing in Grade 10";
          if (id === "main") igcseState.grade10.englishExamStatus = "Appearing in Grade 10";
          getChildElement(id, "card_eng_stat_pending", containerEl)?.classList.add("selected");
          getChildElement(id, "card_eng_stat_done", containerEl)?.classList.remove("selected");
        }
      } else if (e.target.value !== "None yet" && e.target.checked && noneCb) {
        noneCb.checked = false;
      }

      // Synchronize English status with English examined checkbox
      if (e.target.value === "English") {
        const engDone = getChildElement(id, "eng_stat_done", containerEl);
        const engPend = getChildElement(id, "eng_stat_pending", containerEl);
        if (e.target.checked) {
          if (engDone) engDone.checked = true;
          state.grade10.englishExamStatus = "Already examined in Grade 9";
          if (id === "main") igcseState.grade10.englishExamStatus = "Already examined in Grade 9";
          getChildElement(id, "card_eng_stat_done", containerEl)?.classList.add("selected");
          getChildElement(id, "card_eng_stat_pending", containerEl)?.classList.remove("selected");
        } else {
          if (engPend) engPend.checked = true;
          state.grade10.englishExamStatus = "Appearing in Grade 10";
          if (id === "main") igcseState.grade10.englishExamStatus = "Appearing in Grade 10";
          getChildElement(id, "card_eng_stat_pending", containerEl)?.classList.add("selected");
          getChildElement(id, "card_eng_stat_done", containerEl)?.classList.remove("selected");
        }
      }

      state.grade10.grade9ExaminedSubjects = Array.from(g9SubjectCheckboxes)
        .filter((c) => c.checked)
        .map((c) => c.value);
      if (id === "main") {
        igcseState.grade10.grade9ExaminedSubjects = [...state.grade10.grade9ExaminedSubjects];
      }

      // Clear previous exam error message if visible
      const errPrev = getChildElement(id, "validation_g10_prev_exam", containerEl);
      if (errPrev) { errPrev.textContent = ""; errPrev.style.display = "none"; }

      updateChildLiveSummary(id, containerEl);
      if (typeof window.generateSummaryHTML === "function") window.generateSummaryHTML();
    });
  });

  // Wire Grade 9 Other Examined Subjects text input
  const otherSubs = getChildElement(id, "g10OtherExaminedSubjects", containerEl);
  if (otherSubs) {
    otherSubs.addEventListener("input", (e) => {
      const state = getChildAcademicState(id);
      state.grade10.grade9ExaminedOther = e.target.value.trim();
      if (id === "main") igcseState.grade10.grade9ExaminedOther = state.grade10.grade9ExaminedOther;
      updateChildLiveSummary(id, containerEl);
      if (typeof window.generateSummaryHTML === "function") window.generateSummaryHTML();
    });
  }

  // Wire English exam status radios
  scopedQueryAll(containerEl, `input[name="${getRadioName('g10_english_status', id)}"]`).forEach((radio) => {
    radio.addEventListener("change", (e) => {
      if (e.target.checked) {
        const state = getChildAcademicState(id);
        state.grade10.englishExamStatus = e.target.value;
        if (id === "main") igcseState.grade10.englishExamStatus = e.target.value;

        const cardPend = getChildElement(id, "card_eng_stat_pending", containerEl);
        const cardDone = getChildElement(id, "card_eng_stat_done", containerEl);
        const cardWait = getChildElement(id, "card_eng_stat_awaited", containerEl);
        if (cardPend) cardPend.classList.toggle("selected", e.target.value === "Appearing in Grade 10");
        if (cardDone) cardDone.classList.toggle("selected", e.target.value === "Already examined in Grade 9");
        if (cardWait) cardWait.classList.toggle("selected", e.target.value === "Result awaited");

        // Cross-sync with Grade 9 examined subjects checkboxes
        const engCb = Array.from(g9SubjectCheckboxes).find((c) => c.value === "English");
        const noneCb = Array.from(g9SubjectCheckboxes).find((c) => c.value === "None yet");
        if (e.target.value === "Already examined in Grade 9") {
          if (engCb) engCb.checked = true;
          if (noneCb) noneCb.checked = false;
        } else if (e.target.value === "Appearing in Grade 10") {
          if (engCb) engCb.checked = false;
        }

        state.grade10.grade9ExaminedSubjects = Array.from(g9SubjectCheckboxes)
          .filter((c) => c.checked)
          .map((c) => c.value);
        if (id === "main") {
          igcseState.grade10.grade9ExaminedSubjects = [...state.grade10.grade9ExaminedSubjects];
        }

        // Clear previous exam error message if visible
        const errPrev = getChildElement(id, "validation_g10_prev_exam", containerEl);
        if (errPrev) { errPrev.textContent = ""; errPrev.style.display = "none"; }

        updateChildLiveSummary(id, containerEl);
        if (typeof window.generateSummaryHTML === "function") window.generateSummaryHTML();
      }
    });
  });

  // Wire Exemption radios
  scopedQueryAll(containerEl, `input[name="${getRadioName('g10_exempt_option', id)}"]`).forEach((radio) => {
    radio.addEventListener("change", (e) => {
      if (e.target.checked) {
        const state = getChildAcademicState(id);
        state.grade10.exemptionsStatus = e.target.value;
        if (id === "main") igcseState.grade10.exemptionsStatus = e.target.value;

        const isExempt = e.target.value.includes("Exemption requested");
        const cardNone = getChildElement(id, "card_g10_exempt_none", containerEl);
        const cardApp = getChildElement(id, "card_g10_exempt_applied", containerEl);
        if (cardNone) cardNone.classList.toggle("selected", !isExempt);
        if (cardApp) cardApp.classList.toggle("selected", isExempt);

        const wrap = getChildElement(id, "g10ExemptionNoteWrap", containerEl);
        if (wrap) wrap.style.display = isExempt ? "block" : "none";

        updateChildLiveSummary(id, containerEl);
        if (typeof window.generateSummaryHTML === "function") window.generateSummaryHTML();
      }
    });
  });

  // Wire Exemption details text
  const exemptDetails = getChildElement(id, "g10ExemptionDetails", containerEl);
  if (exemptDetails) {
    exemptDetails.addEventListener("input", (e) => {
      const state = getChildAcademicState(id);
      state.grade10.exemptionDetails = e.target.value.trim();
      if (id === "main") igcseState.grade10.exemptionDetails = state.grade10.exemptionDetails;
      updateChildLiveSummary(id, containerEl);
      if (typeof window.generateSummaryHTML === "function") window.generateSummaryHTML();
    });
  }
}

/* ==========================================================================
   VALIDATION ENGINE (PHASE 3)
   ========================================================================== */

/* Validate academic selections for a single child */
function validateChild(childId) {
  const state = getChildAcademicState(childId);
  const errors = {};

  if (!state || !state.isEligible) {
    return { isValid: true, errors: {} };
  }

  // Grade 8: foundation program, stream selection not required yet
  if (state.gradeLevel === 8) {
    return { isValid: true, errors: {} };
  }

  // Grade 9 & Grade 10 compulsory rules
  if (state.gradeLevel === 9 || state.gradeLevel === 10) {
    if (!state.englishChoice) {
      errors.english = "Please choose exactly ONE compulsory English syllabus.";
    }

    if (!state.stream) {
      errors.stream = "Please choose exactly ONE complete academic stream.";
    } else if (state.stream === "humanities" && !IGCSE_CONFIG.sessionConfig.isSessionAvailable("2027-2028")) {
      errors.stream = "Humanities stream is not available before the 2027–2028 academic session.";
    }

    if (state.gradeLevel === 10) {
      if (!state.grade10.examBoard) {
        errors.g10Board = "Please select the examination board (Cambridge or Pearson Edexcel).";
      }
      if (!state.grade10.appearingYear) {
        errors.g10Year = "Please select the examination appearing year.";
      }
      if (!state.grade10.examSession) {
        errors.g10Session = "Please select the examination session (May/June or Oct/Nov).";
      }
      if (!state.grade10.syllabusPrep) {
        errors.g10Prep = "Please select your current syllabus preparation status.";
      }

      // Contradictory selections verification
      const examined = state.grade10.grade9ExaminedSubjects || [];
      const engStatus = state.grade10.englishExamStatus;

      if (examined.includes("None yet") && examined.some((s) => s !== "None yet")) {
        errors.g10Examined = "Contradictory selection: 'None yet' cannot be selected together with other examined subjects.";
      } else if (examined.includes("English") && engStatus === "Appearing in Grade 10") {
        errors.g10Examined = "Contradictory English status: English is marked as examined in Grade 9, but English Examination Status is set to 'Appearing in Grade 10'.";
      } else if (engStatus === "Already examined in Grade 9" && examined.includes("None yet")) {
        errors.g10Examined = "Contradictory English status: English cannot be already examined in Grade 9 while 'None yet' is selected.";
      }
    }
  }

  state.validationErrors = errors;
  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
}

/* Display inline validation messages on UI */
function displayChildValidationErrors(childId, errors = {}) {
  const root = document.getElementById(childId === "main" ? "igcseSubjectSection" : `academicContainer_${childId}`);
  if (!root) return;

  const setMsg = (baseId, msg) => {
    const el = getChildElement(childId, baseId, root);
    if (!el) return;
    if (msg) {
      el.textContent = msg;
      el.style.display = "flex";
    } else {
      el.textContent = "";
      el.style.display = "none";
    }
  };

  setMsg("validation_english", errors.english || "");
  setMsg("validation_stream", errors.stream || "");
  setMsg("validation_g10_board", errors.g10Board || "");
  setMsg("validation_g10_year", errors.g10Year || "");
  setMsg("validation_g10_session", errors.g10Session || "");
  setMsg("validation_g10_prep", errors.g10Prep || "");
  setMsg("validation_g10_prev_exam", errors.g10Examined || "");
}

/* Validate all active children before form submission / PDF generation */
function validateAllActiveChildren() {
  let allValid = true;
  let firstInvalidEl = null;

  // Validate main child
  const mainGradeSelect = document.getElementById("gradeSelect");
  const mainGradeInfo = detectGradeAndCurriculum(mainGradeSelect);
  if (mainGradeInfo.isEligible) {
    const res = validateChild("main");
    displayChildValidationErrors("main", res.errors);
    if (!res.isValid) {
      allValid = false;
      if (!firstInvalidEl) {
        firstInvalidEl = document.getElementById("igcseSubjectSection");
      }
    }
  }

  // Validate additional children
  const extraBlocks = document.querySelectorAll(
    "#additionalChildrenContainer .child-block, #studentInfoSection .child-block:not(.main-child)"
  );
  const validExtraBlocks = Array.from(extraBlocks).filter((b) => !b.closest("#childTemplate"));

  validExtraBlocks.forEach((block) => {
    const childId = block.dataset.childId;
    if (!childId) return;
    const gradeSelect = block.querySelector(".childGradeSelect") || block.querySelector("select");
    const gradeInfo = detectGradeAndCurriculum(gradeSelect);
    if (gradeInfo.isEligible) {
      const res = validateChild(childId);
      displayChildValidationErrors(childId, res.errors);
      if (!res.isValid) {
        allValid = false;
        if (!firstInvalidEl) {
          firstInvalidEl = block;
        }
      }
    }
  });

  if (!allValid && firstInvalidEl) {
    try {
      firstInvalidEl.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch {}
    alert("Please complete the required academic selections for all registered children before proceeding.");
  }

  return allValid;
}

/* ==========================================================================
   LEGACY COMPATIBILITY HANDLERS (FORWARD TO CHILD "main")
   ========================================================================== */

function initIgcseSubjectSelection() {
  const gradeSelect = document.getElementById("gradeSelect");
  const mainWrapper = document.getElementById("igcseSubjectSection");
  if (!gradeSelect || !mainWrapper) return;

  initChildAcademicComponent("main", mainWrapper, gradeSelect);
}

function handleGradeChange() {
  const gradeSelect = document.getElementById("gradeSelect");
  const mainWrapper = document.getElementById("igcseSubjectSection");
  if (gradeSelect && mainWrapper) {
    handleChildGradeChange("main", gradeSelect, mainWrapper);
  }
}

function handleEnglishSelection(choice) {
  handleChildEnglishSelection("main", choice);
}

function handleStreamSelection(streamKey) {
  handleChildStreamSelection("main", streamKey);
}

function handleOptionalCsToggle(isChecked) {
  handleChildOptionalCsToggle("main", isChecked);
}

function handlePathwaySelection(pathwayValue) {
  handleChildPathwaySelection("main", pathwayValue);
}

function handleExemptionChange() {
  handleChildExemptionChange("main");
}

function populateGrade10AppearingYears() {
  populateGrade10AppearingYearsForChild("main");
}

function evaluateGrade10AdmissionConditions() {
  evaluateChildGrade10AdmissionConditions("main");
}

function clearGrade10Data() {
  clearChildGrade10Data("main");
}

function resetGrade910FieldsOnly() {
  resetChildGrade910FieldsOnly("main");
}

function clearIgcseSelections() {
  clearChildAcademicState("main");
  const mainWrapper = document.getElementById("igcseSubjectSection");
  if (mainWrapper) mainWrapper.style.display = "none";
}

function getIgcseSummaryData() {
  return getChildIgcseSummaryData("main");
}

function updateLiveSummary() {
  updateChildLiveSummary("main");
}

function getIgcseSummarySnippetHTML() {
  return getChildIgcseSummarySnippetHTML("main");
}

function getIgcseSubmissionData() {
  return getChildIgcseSummaryData("main");
}

function applySessionRulesToStreams() {
  applySessionRulesToStreamsForChild("main");
}

/* ---------- Auto-fill SESSION (Configurable & Dynamic) ---------- */
function getCurrentAcademicSession() {
  if (typeof IGCSE_CONFIG !== "undefined" && IGCSE_CONFIG?.sessionConfig) {
    return IGCSE_CONFIG.sessionConfig.getActiveSession();
  }
  const currentYear = new Date().getFullYear();
  const nextYear = currentYear + 1;
  return `${currentYear}-${String(nextYear).slice(-2)}`;
}

function autoFillCurrentSession() {
  const sessionValue = getCurrentAcademicSession();

  const sessionText = document.getElementById("sessionText");
  if (sessionText) sessionText.textContent = sessionValue;

  const sessionInput = document.getElementById("session");
  if (sessionInput) sessionInput.value = sessionValue;
}
/* ---------- NEW: Auto-fill DATE OF REGISTRATION (MM/DD/YYYY boxes) ---------- */
function autoFillRegDate() {
  const container = document.getElementById("regBoxes");
  if (!container) return;

  const boxes = Array.from(container.querySelectorAll(".box"));
  if (!boxes.length) return;

  // If user already typed something, don't overwrite
  const anyFilled = boxes.some((b) => (b.value || "").trim() !== "");
  if (anyFilled) return;

  const now = new Date();
  // current date -> MM/DD/YYYY (boxes expect this order)
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const yyyy = String(now.getFullYear());

  const seq = (mm + dd + yyyy).split(""); // "MMDDYYYY"
  boxes.forEach((b, i) => {
    if (i < seq.length) b.value = seq[i];
  });

  // hidden ISO for backend if present
  const hidden = document.getElementById("regDate");
  if (hidden) hidden.value = `${yyyy}-${mm}-${dd}`;
}

/* ---------- 1) SIGNATURE PAD (mouse + touch) ---------- */
let sigCanvas,
  sigCtx,
  isDrawing = false,
  lastPoint = null;

// Prevent double submit / double save
let isSubmittingAdmission = false;

function initSignaturePad() {
  sigCanvas = document.getElementById("sig");
  if (!sigCanvas) return; // not on this page

  sigCtx = sigCanvas.getContext("2d");
  sigCtx.lineWidth = 2;
  sigCtx.lineCap = "round";
  sigCtx.strokeStyle = "#0f172a";

  const getPos = (e) => {
    const t = e.touches ? e.touches[0] : e;
    const r = sigCanvas.getBoundingClientRect();
    return {
      x: (t.clientX - r.left) * (sigCanvas.width / r.width),
      y: (t.clientY - r.top) * (sigCanvas.height / r.height),
    };
  };

  const clearErrors = () => {
    sigCanvas.classList.remove("has-error");
    const sigErr = document.getElementById("sigError");
    if (sigErr) sigErr.style.display = "none";
  };

  const start = (e) => {
    isDrawing = true;
    lastPoint = getPos(e);
    clearErrors();
    e.preventDefault();
  };
  const move = (e) => {
    if (!isDrawing) return;
    const p = getPos(e);
    sigCtx.beginPath();
    sigCtx.moveTo(lastPoint.x, lastPoint.y);
    sigCtx.lineTo(p.x, p.y);
    sigCtx.stroke();
    lastPoint = p;
    e.preventDefault();
  };
  const end = () => {
    isDrawing = false;
    lastPoint = null;
  };

  // Mouse
  sigCanvas.addEventListener("mousedown", start);
  sigCanvas.addEventListener("mousemove", move);
  document.addEventListener("mouseup", end);

  // Touch
  sigCanvas.addEventListener("touchstart", start, { passive: false });
  sigCanvas.addEventListener("touchmove", move, { passive: false });
  sigCanvas.addEventListener("touchend", end);

  // Clear
  const clr = document.getElementById("clearSig");
  if (clr)
    clr.addEventListener("click", () => {
      sigCtx.clearRect(0, 0, sigCanvas.width, sigCanvas.height);
    });
}

/* ---------- 2) BUTTONS: PDF ---------- */

// keep this number only for fallback text; native share lets the user pick the contact
const SCHOOL_WHATSAPP = "923355245551"; // 92 + phone (no plus sign)

function wireButtons() {
  const pdfBtn = document.getElementById("btnPdf");
  if (pdfBtn)
    pdfBtn.addEventListener("click", () => exportPdfAndOpenWhatsAppApp());
}

function setPdfButtonBusyState(isBusy) {
  const btn = document.getElementById("btnPdf");
  if (!btn) return;

  if (isBusy) {
    btn.disabled = true;
    btn.setAttribute("aria-disabled", "true");
    btn.style.pointerEvents = "none";
    btn.style.opacity = "0.6";
    btn.dataset.originalText = btn.textContent;
    btn.textContent = "Saving...";
  } else {
    btn.disabled = false;

    const master = document.getElementById("declMaster");
    if (master && !master.checked) {
      btn.setAttribute("aria-disabled", "true");
      btn.style.pointerEvents = "none";
      btn.style.opacity = "0.5";
    } else {
      btn.removeAttribute("aria-disabled");
      btn.style.pointerEvents = "auto";
      btn.style.opacity = "1";
    }

    if (btn.dataset.originalText) {
      btn.textContent = btn.dataset.originalText;
    } else {
      btn.textContent = "Save Filled Form as PDF";
    }
  }
}

/* Utility for signature verification and export */
function isSignatureProvided() {
  if (!sigCanvas) return false;
  const blank = document.createElement("canvas");
  blank.width = sigCanvas.width;
  blank.height = sigCanvas.height;
  return sigCanvas.toDataURL() !== blank.toDataURL();
}

function getSignatureDataURL() {
  if (!sigCanvas) return "";
  const blank = document.createElement("canvas");
  blank.width = sigCanvas.width;
  blank.height = sigCanvas.height;
  if (sigCanvas.toDataURL() === blank.toDataURL()) return "";
  return sigCanvas.toDataURL("image/png");
}

/* ---------- 3) Build PDF from .page elements with proportional vertical slicing ---------- */
async function buildPdfFromPages() {
  const { jsPDF } = window.jspdf;

  // Make sure live children summary is fully updated
  if (typeof generateSummaryHTML === "function") generateSummaryHTML();

  // Collect .page elements before hiding footer
  const pages = Array.from(document.querySelectorAll(".page"));
  if (!pages.length) return null;

  // Export mode: hide fixed footer
  document.body.classList.add("pdf-export");
  const infoBar = document.querySelector(".info-bar");
  const prevBarDisp = infoBar ? infoBar.style.display : null;
  if (infoBar) infoBar.style.display = "none";

  // Ensure images are fully loaded
  await Promise.all(
    Array.from(document.images).map((img) => {
      if (img.complete) return Promise.resolve();
      return new Promise((res) => {
        img.onload = img.onerror = res;
      });
    })
  );

  const pdf = new jsPDF("p", "pt", "a4");
  const pageW = pdf.internal.pageSize.getWidth(); // ~595.28 pt
  const pageH = pdf.internal.pageSize.getHeight(); // ~841.89 pt
  let isFirstPdfPage = true;

  for (let i = 0; i < pages.length; i++) {
    const el = pages[i];

    const canvas = await html2canvas(el, {
      scale: 2.0,
      useCORS: true,
      allowTaint: false,
      backgroundColor: "#ffffff",
      logging: false,
      windowWidth: 980,
      scrollX: 0,
      scrollY: 0,
    });

    const naturalHeightPt = (canvas.height * pageW) / canvas.width;

    if (naturalHeightPt <= pageH + 5) {
      // Single A4 page fits cleanly
      if (isFirstPdfPage) {
        isFirstPdfPage = false;
      } else {
        pdf.addPage();
      }
      const imgData = canvas.toDataURL("image/jpeg", 0.95);
      pdf.addImage(imgData, "JPEG", 0, 0, pageW, naturalHeightPt);
    } else {
      // Content is taller than standard A4: slice proportionally without squashing
      const sliceHeightPx = Math.floor((canvas.width * pageH) / pageW);
      let currentY = 0;

      while (currentY < canvas.height) {
        const remainingPx = canvas.height - currentY;
        if (remainingPx < 25 && currentY > 0) {
          break; // Avoid tiny sliver trailing pages
        }
        const currentSlicePx = Math.min(sliceHeightPx, remainingPx);

        const sliceCanvas = document.createElement("canvas");
        sliceCanvas.width = canvas.width;
        sliceCanvas.height = currentSlicePx;

        const ctx = sliceCanvas.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, sliceCanvas.width, currentSlicePx);
        ctx.drawImage(
          canvas,
          0, currentY, canvas.width, currentSlicePx,
          0, 0, canvas.width, currentSlicePx
        );

        const sliceImgData = sliceCanvas.toDataURL("image/jpeg", 0.95);
        const sliceHeightPt = (currentSlicePx * pageW) / canvas.width;

        if (isFirstPdfPage) {
          isFirstPdfPage = false;
        } else {
          pdf.addPage();
        }

        pdf.addImage(sliceImgData, "JPEG", 0, 0, pageW, sliceHeightPt);
        currentY += currentSlicePx;
      }
    }
  }

  // Restore UI
  if (infoBar) infoBar.style.display = prevBarDisp || "";
  document.body.classList.remove("pdf-export");

  const studentClean = (document.getElementById("studentName")?.value || "Student")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "_");
  const filename = `IVS-Admission-${studentClean}-${new Date().toISOString().slice(0, 10)}.pdf`;
  return { pdf, filename };
}

/* Helper to format comprehensive academic record for a child */
function formatChildAdmissionRecord(childId, name, gender, dob, grade, session) {
  const academicState = getChildAcademicState(childId);
  const igcseData = typeof getChildIgcseSummaryData === "function" ? getChildIgcseSummaryData(childId) : null;
  const grade10Admission = igcseData?.grade10Admission || null;

  const curriculum = academicState.curriculum ||
    (grade.includes("IGCSE") ? "IGCSE" : (grade.includes("FBISE") ? "FBISE" : "Standard"));
  const gradeLevel = academicState.gradeLevel || null;

  // Academic stream details
  let streamName = "N/A";
  let streamSubjects = [];
  if (academicState.stream) {
    const streamConfig = IGCSE_CONFIG.streams[academicState.stream];
    streamName = streamConfig ? streamConfig.name : academicState.stream;
    streamSubjects = academicState.streamSubjects ? [...academicState.streamSubjects] : [];
  } else if (igcseData?.stream && igcseData.stream !== "None selected") {
    streamName = igcseData.stream;
    streamSubjects = igcseData.streamSubjects ? [...igcseData.streamSubjects] : [];
  }

  // English option
  const englishOption = academicState.englishChoice ||
    (igcseData?.englishChoice && igcseData.englishChoice !== "Pending Selection" ? igcseData.englishChoice : "N/A");

  // Optional subject request
  const optionalSubjectRequest = academicState.optionalCsRequested
    ? "Computer Science (Requested - Subject to school approval)"
    : "None";

  // Pakistani examination subjects status
  let pakistaniPathwayStatus = "N/A";
  if (curriculum === "IGCSE") {
    if (academicState.pathway === "overseas_exemption") {
      const exemptions = [];
      if (academicState.exemptions.urdu) exemptions.push("Urdu");
      if (academicState.exemptions.islamiyat) exemptions.push("Islamiyat");
      if (academicState.exemptions.pakStudies) exemptions.push("Pakistan Studies");
      pakistaniPathwayStatus = exemptions.length
        ? `Exemption Requested: ${exemptions.join(", ")} (Pending Academic Verification)`
        : "Overseas Pathway (No exemptions selected)";
    } else {
      pakistaniPathwayStatus = "Urdu, Islamiyat, Pakistan Studies (Grade 9 Compulsory)";
    }
  }

  // Grade 10 specifics
  const examinationBoard = grade10Admission?.examBoard && grade10Admission.examBoard !== "Pending Selection"
    ? grade10Admission.examBoard
    : (gradeLevel === 10 ? (academicState.grade10?.examBoard || "Pending Selection") : "N/A");

  const examinationYear = grade10Admission?.appearingYear && grade10Admission.appearingYear !== "Pending Selection"
    ? grade10Admission.appearingYear
    : (gradeLevel === 10 ? (academicState.grade10?.appearingYear || "Pending Selection") : "N/A");

  const examinationSession = grade10Admission?.examSession && grade10Admission.examSession !== "Pending Selection"
    ? grade10Admission.examSession
    : (gradeLevel === 10 ? (academicState.grade10?.examSession || "Pending Selection") : "N/A");

  const previousExamSubjects = grade10Admission?.grade9ExaminedSubjects
    ? [...grade10Admission.grade9ExaminedSubjects]
    : (academicState.grade10?.grade9ExaminedSubjects ? [...academicState.grade10.grade9ExaminedSubjects] : []);

  const academicReviewStatus = grade10Admission?.admissionStatus ||
    (gradeLevel === 10 ? (academicState.grade10?.admissionStatus || "Evaluation Pending") : "Not Applicable");

  const record = {
    student_name: name,
    gender: gender,
    dob: dob,
    grade: grade,
    curriculum: curriculum,
    grade_level: gradeLevel,
    academic_session: session,
    examination_board: examinationBoard,
    english_option: englishOption,
    academic_stream: streamName,
    stream_subjects: streamSubjects,
    optional_subject_request: optionalSubjectRequest,
    pakistani_pathway_status: pakistaniPathwayStatus,
    examination_year: examinationYear,
    examination_session: examinationSession,
    previous_examination_subjects: previousExamSubjects,
    academic_review_status: academicReviewStatus
  };

  if (curriculum === "IGCSE" && igcseData) {
    record.igcse_subject_selection = igcseData;
    if (igcseData.gradeLevel === 10 && igcseData.grade10Admission) {
      record.grade10_admission_evaluation = igcseData.grade10Admission;
    }
  } else if (curriculum === "IGCSE" && gradeLevel === 10 && academicState?.grade10) {
    record.grade10_admission_evaluation = academicState.grade10;
  }

  return record;
}

/* ---------- Build payload for dashboard /api/admissions (Phase 4 Extended) ---------- */
function buildAdmissionPayloadForDashboard() {
  // session
  let session =
    document.getElementById("session")?.value?.trim() ||
    document.getElementById("sessionText")?.textContent?.trim() ||
    "";
  if (!session) session = getCurrentAcademicSession();

  // registration date
  let registration_date =
    document.getElementById("regDate")?.value?.trim() || "";
  if (!registration_date) {
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const yyyy = String(now.getFullYear());
    registration_date = `${yyyy}-${mm}-${dd}`;
  }

  const processed_by =
    document.getElementById("processedByName")?.textContent?.trim() || "";

  const father_name =
    document.getElementById("fatherName")?.value?.trim() || "";
  const guardian_whatsapp =
    cleanPhoneNumber(document.getElementById("gWhats")?.value || "");
  const religion =
    document.getElementById("religion")?.value?.trim() || "";
  const father_email =
    document.getElementById("fatherEmail")?.value?.trim() || "";

  const father_occupation =
    document.getElementById("fOcc")?.value?.trim() || "";
  const nationality =
    document.getElementById("nation")?.value?.trim() || "";

  const present_address =
    document.getElementById("addr")?.value?.trim() ||
    document.getElementById("address")?.value?.trim() ||
    "";
  const secondary_contact =
    cleanPhoneNumber(document.getElementById("sContact")?.value || "");

  const city =
    document.getElementById("city")?.value?.trim() || "";
  const state =
    document.getElementById("state")?.value?.trim() || "";

  const children = [];

  // main student
  const mainName =
    document.getElementById("studentName")?.value?.trim() || "";
  const mainDob = document.getElementById("dob")?.value?.trim() || "";
  const mainGrade =
    document.getElementById("gradeSelect")?.value?.trim() || "";
  const mainGender =
    Array.from(document.querySelectorAll('input[name="gender"]')).find(
      (r) => r.checked
    )?.value || "";

  if (mainName || mainDob || mainGrade || mainGender) {
    const mainRecord = formatChildAdmissionRecord("main", mainName, mainGender, mainDob, mainGrade, session);
    children.push(mainRecord);
  }

  // extra children
  const extraBlocks = document.querySelectorAll(
    "#additionalChildrenContainer .child-block, #studentInfoSection .child-block:not(.main-child)"
  );
  const validExtraBlocks = Array.from(extraBlocks).filter(
    (b) => !b.closest("#childTemplate")
  );

  validExtraBlocks.forEach((block) => {
    const childId = block.dataset.childId;
    const name = block.querySelector(".studentName")?.value?.trim() || "";
    const dob = block.querySelector(".dob")?.value?.trim() || "";
    const grade =
      (block.querySelector(".childGradeSelect") || block.querySelector("select"))
        ?.value?.trim() || "";
    const gender =
      block.querySelector('input[type="radio"]:checked')?.value || "";

    if (name || dob || grade || gender) {
      const extraRecord = formatChildAdmissionRecord(childId, name, gender, dob, grade, session);
      children.push(extraRecord);
    }
  });

  if (typeof window !== "undefined") {
    if (!window._activeSubmissionId) {
      window._activeSubmissionId = "SUB-" + Date.now() + "-" + Math.random().toString(36).substring(2, 8).toUpperCase();
    }
  }
  const submission_id = (typeof window !== "undefined" && window._activeSubmissionId) ? window._activeSubmissionId : ("SUB-" + Date.now());

  return {
    submission_id,
    session,
    registration_date,
    processed_by,
    father_name,
    guardian_whatsapp,
    religion,
    father_email,
    father_occupation,
    nationality,
    present_address,
    city,
    state,
    secondary_contact,
    declaration_version: "IVS-DECL-V4-2026",
    declaration_acknowledged: Boolean(document.getElementById("declMaster")?.checked),
    declaration_acknowledged_at: window._declAcknowledgedAt || new Date().toISOString(),
    signature_data_url: getSignatureDataURL(),
    children,
  };
}

/* Secure server proxy submission */
async function sendAdmissionToDashboard() {
  const payload = buildAdmissionPayloadForDashboard();

  if (!payload.children || !payload.children.length) {
    alert("Please enter the student's name and details before submitting.");
    return false;
  }

  try {
    const res = await fetch(ADMISSION_SUBMIT_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.ok) {
      const msg = data.message || "Failed to submit admission to the server. Please check your information and try again.";
      alert(msg);
      return false;
    }

    if (data.reviewMode) {
      console.log(`[Admission] [Review Mode] Form validated successfully. Reference: ${data.id}. Live submissions disabled.`);
      alert("Advisor Review Mode:\n\nForm validation succeeded!\n\nNote: Submissions are disabled in this review deployment (no data was saved or sent to the dashboard).\n\nYour preview PDF will now be generated.");
    } else if (data.dashboardSaved) {
      console.log(`[Admission] Registration completed and synced to dashboard: ${data.id}`);
    } else {
      console.warn(`[Admission] Registration saved to school database (Dashboard sync: ${data.dashboardMessage || 'Pending'})`);
    }

    return {
      success: true,
      ...data
    };
  } catch (err) {
    console.error("Error submitting admission:", err);
    alert("Connection to admission server failed. Please check your internet connection and try again.");
    return false;
  }
}

/* ---------- 4) Send Data + Export PDF + WhatsApp ---------- */
async function exportPdfAndOpenWhatsAppApp() {
  // Stop repeated clicks immediately
  if (isSubmittingAdmission) {
    return;
  }

  // 1. Validate main student mandatory fields
  const studentNameEl = document.getElementById("studentName");
  const studentName = studentNameEl?.value?.trim() || "";
  if (!studentName) {
    alert("Please enter the student's name.");
    studentNameEl?.focus();
    return;
  }

  const dobEl = document.getElementById("dob");
  const dob = dobEl?.value?.trim() || "";
  if (!dob) {
    alert("Please enter the student's date of birth.");
    dobEl?.focus();
    return;
  }

  const gradeSelectEl = document.getElementById("gradeSelect");
  const grade = gradeSelectEl?.value?.trim() || "";
  if (!grade) {
    alert("Please select a grade for the student.");
    const mobileTrigger = document.getElementById("gradeSelectMobileTrigger");
    if (mobileTrigger && window.getComputedStyle && window.getComputedStyle(mobileTrigger).display !== "none") {
      mobileTrigger.focus();
    } else {
      gradeSelectEl?.focus();
    }
    return;
  }

  const fatherNameEl = document.getElementById("fatherName");
  const fatherName = fatherNameEl?.value?.trim() || "";
  if (!fatherName) {
    alert("Please enter the father's / guardian's name.");
    fatherNameEl?.focus();
    return;
  }

  const gWhatsEl = document.getElementById("gWhats");
  const gWhats = cleanPhoneNumber(gWhatsEl?.value || "");
  if (!gWhats || gWhats.length < 8) {
    alert("Please enter a valid Guardian WhatsApp number.");
    gWhatsEl?.focus();
    return;
  }

  // Phase 3: Validate all active children before proceeding
  if (typeof validateAllActiveChildren === "function" && !validateAllActiveChildren()) {
    return;
  }

  // Master "I agree" must be checked
  const master = document.getElementById("declMaster");
  if (!master || !master.checked) {
    alert('Please tick the "I agree" checkbox to confirm your acknowledgment of the declaration.');
    try { master?.scrollIntoView({ behavior: "smooth", block: "center" }); } catch {}
    return;
  }

  // Signature validation: must not be empty
  const sigUrl = getSignatureDataURL();
  const sigCanvasEl = document.getElementById("sig");
  const sigErrEl = document.getElementById("sigError");
  if (!sigUrl) {
    if (sigCanvasEl) sigCanvasEl.classList.add("has-error");
    if (sigErrEl) sigErrEl.style.display = "block";
    alert("Please provide the parent/guardian signature on the canvas before proceeding.");
    try { sigCanvasEl?.scrollIntoView({ behavior: "smooth", block: "center" }); } catch {}
    return;
  } else {
    if (sigCanvasEl) sigCanvasEl.classList.remove("has-error");
    if (sigErrEl) sigErrEl.style.display = "none";
  }

  isSubmittingAdmission = true;
  setPdfButtonBusyState(true);

  try {
    // 2. Submit admission payload to secure backend
    const submitResult = await sendAdmissionToDashboard();
    if (!submitResult || !submitResult.success) {
      // Submission was rejected or failed; stop here without generating PDF
      return;
    }

    // 3. Mark declaration checkboxes for PDF capture
    document
      .querySelectorAll(".declaration-list input.decl")
      .forEach((cb) => (cb.checked = true));

    // 4. Generate clean multi-page PDF & continue with WhatsApp + download flow
    await exportPdfAndOpenWhatsAppApp_Inner(submitResult);
    if (typeof window !== "undefined") {
      window._activeSubmissionId = null;
    }
  } catch (err) {
    console.error("Error during admission submit flow:", err);
    alert("Something went wrong while completing your admission. Please try again.");
  } finally {
    isSubmittingAdmission = false;
    setPdfButtonBusyState(false);
  }
}

/* ---------- 4) Share to WhatsApp APP with attached PDF (native share) ---------- */
async function exportPdfAndOpenWhatsAppApp_Inner(submitResult) {
  const built = await buildPdfFromPages();
  if (!built) return;
  const { pdf, filename } = built;

  // Build a File for Web Share API (required for attaching to WhatsApp)
  const blob = pdf.output("blob");
  const file = new File([blob], filename, { type: "application/pdf" });

  const student =
    document.getElementById("studentName")?.value?.trim() || "student";
  const isReview = Boolean(submitResult?.reviewMode);
  const refText = isReview
    ? `\nApplication Ref: ${submitResult.id} (Advisor Review Mode - Sample Preview)`
    : (submitResult?.id ? `\nApplication Ref: ${submitResult.id}` : "");
  const caption =
    `IVS Admission Form for ${student}\n` +
    `Session: ${getCurrentAcademicSession()}${refText}\n\n` +
    (isReview ? `Please review this sample preview PDF (Review Mode). Thank you.` : `Please review the attached PDF. Thank you.`);

  try {
    // Best path: native share with FILES (Android Chrome, iOS Safari 16.4+ over HTTPS)
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        files: [file],
        title: "IVS Admission Form",
        text: caption,
      });

      // optional: also save a local copy for the user
      try {
        pdf.save(filename);
      } catch {}
      return; // user is now in WhatsApp app with the file attached
    }
  } catch (err) {
    console.warn("Native share failed, will fallback:", err);
  }

  // Fallbacks (no WhatsApp Web):
  // 1) Save the PDF locally so the user can attach inside WhatsApp app
  try {
    pdf.save(filename);
  } catch {}

  // 2) Try to open WhatsApp app with a helpful prefilled text (cannot attach via URL)
  const helper =
    `Assalamu Alaikum. I have saved my admission form PDF (${filename}). ` +
    `I will attach the file here and send.`;
  const deepLink = `whatsapp://send?text=${encodeURIComponent(helper)}`;

  // Try deep link first (opens app on mobile). If it fails silently, show a tip.
  window.location.href = deepLink;

  // As a final hint if nothing happens (desktop, unsupported), guide the user.
  setTimeout(() => {
    alert(
      "If WhatsApp didn’t open automatically, please open the WhatsApp app and attach the saved PDF from your downloads."
    );
  }, 1200);
}

/* ---------- 5) Grade: force single selection (radio-like) ---------- */
function initSingleGradeSelect() {
  const grid = document.querySelector(".grades"); // container of grade boxes
  if (!grid) return;

  const inputs = Array.from(grid.querySelectorAll('input[type="checkbox"]'));

  // A) Page load: if multiple are checked (e.g., after refresh/auto-fill), keep only the first
  const initiallyChecked = inputs.filter((i) => i.checked);
  if (initiallyChecked.length > 1) {
    initiallyChecked.slice(1).forEach((i) => (i.checked = false));
  }

  // B) Make them behave like radios:
  //    - pointerdown fires before the browser toggles the checkbox,
  //      so if the user is about to check a new one, clear others first.
  inputs.forEach((inp) => {
    inp.addEventListener("pointerdown", () => {
      if (!inp.checked) {
        // it's about to become checked
        inputs.forEach((o) => {
          if (o !== inp) o.checked = false;
        });
      }
    });

    // Safety net: after the change, ensure only one remains checked
    inp.addEventListener("change", (e) => {
      if (e.target.checked) {
        inputs.forEach((o) => {
          if (o !== e.target) o.checked = false;
        });
      }
    });
  });
}

function initDeclarationMaster() {
  const master = document.getElementById("declMaster"); // "I agree" checkbox
  const btn = document.getElementById("btnPdf"); // PDF button

  if (!master || !btn) return;

  // Set button state (blur / active)
  const updateAckDetails = () => {
    const ackBox = document.getElementById("declAckTimestamp");
    if (master.checked) {
      const now = new Date();
      window._declAcknowledgedAt = now.toISOString();
      const timeStr = now.toLocaleDateString("en-PK", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
        timeZone: "Asia/Karachi",
      });
      if (ackBox) {
        ackBox.textContent = `Declaration Version: IVS-DECL-V4-2026 | Acknowledged on: ${timeStr} (Pakistan Time)`;
        ackBox.style.display = "block";
      }
    } else {
      window._declAcknowledgedAt = null;
      if (ackBox) ackBox.style.display = "none";
    }
  };

  const setBtnState = () => {
    updateAckDetails();
    if (master.checked) {
      btn.removeAttribute("aria-disabled");
      btn.style.pointerEvents = "auto"; // clickable
      btn.style.opacity = "1"; // visually active
    } else {
      btn.setAttribute("aria-disabled", "true");
      btn.style.pointerEvents = "none"; // completely unclickable
      btn.style.opacity = "0.5"; // visually disabled
    }
  };

  // Set initial state on page load
  setBtnState();

  // Update when checkbox changes
  master.addEventListener("change", setBtnState);

  // If not ticked, show alert and block click
  btn.addEventListener("click", (e) => {
    if (!master.checked) {
      e.preventDefault();
      e.stopImmediatePropagation(); // stop event completely
      alert('Please tick the “I agree” checkbox to proceed.');
      try {
        master.scrollIntoView({ behavior: "smooth", block: "center" });
      } catch {}
      return false;
    }
  });
}

/* ---------- ADD ANOTHER CHILD (Phase 3 Multi-Child Independent Management) ---------- */
document.addEventListener("DOMContentLoaded", () => {
  const addBtn = document.getElementById("addChildBtn");
  const template = document.getElementById("childTemplate");
  const container =
    document.getElementById("additionalChildrenContainer") ||
    document.querySelector("#studentInfoSection .content") ||
    document.getElementById("studentInfoSection");

  if (!addBtn || !template || !container) return;

  let childCounter = 1;

  addBtn.addEventListener("click", () => {
    childCounter++;
    const childId = String(childCounter);

    const cloneWrapper = document.createElement("div");
    cloneWrapper.innerHTML = template.innerHTML.replace(/__INDEX__/g, childId);
    const clone = cloneWrapper.firstElementChild;
    if (!clone) return;

    clone.dataset.childId = childId;
    clone.style.display = "block";

    container.appendChild(clone);

    // Find the academic wrapper and grade select inside the clone
    const academicWrapper = clone.querySelector(".child-academic-wrapper");
    const gradeSelect = clone.querySelector(".childGradeSelect") || clone.querySelector("select");

    // Initialize academic component and state for this child
    if (academicWrapper && gradeSelect) {
      initChildAcademicComponent(childId, academicWrapper, gradeSelect);
    }

    // Initialize mobile grade picker for this cloned child
    const mobileTrigger = clone.querySelector(".mobile-grade-trigger");
    if (mobileTrigger && gradeSelect && typeof bindMobileGradeTrigger === "function") {
      bindMobileGradeTrigger(mobileTrigger, gradeSelect);
    }

    // Attach remove event to this clone
    const removeBtn = clone.querySelector(".removeChildBtn");
    if (removeBtn) {
      removeBtn.addEventListener("click", () => {
        clone.remove();
        delete childrenAcademicState[childId];
        if (typeof window.generateSummaryHTML === "function") {
          window.generateSummaryHTML();
        }
      });
    }

    // Smooth scroll to new section
    try {
      clone.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch {}

    // Inputs inside clone update summary on input/change
    const inputs = clone.querySelectorAll("input, select");
    inputs.forEach((inp) => {
      inp.addEventListener("input", () => {
        if (typeof window.generateSummaryHTML === "function") window.generateSummaryHTML();
      });
      inp.addEventListener("change", () => {
        if (typeof window.generateSummaryHTML === "function") window.generateSummaryHTML();
      });
    });

    if (typeof window.generateSummaryHTML === "function") {
      window.generateSummaryHTML();
    }
  });
});

/* ---------- LIVE CHILDREN SUMMARY CREATION (PHASE 3) ---------- */
document.addEventListener("DOMContentLoaded", () => {
  const summaryDiv = document.getElementById("studentSummary");
  const mainFields = {
    name: document.getElementById("studentName"),
    dob: document.getElementById("dob"),
    grade: document.getElementById("gradeSelect"),
    genderRadios: document.querySelectorAll('input[name="gender"]'),
  };

  window.generateSummaryHTML = function () {
    if (!summaryDiv) return;
    let html = "";
    let childNumber = 1;

    // 1. Main Student Info
    const mainName = mainFields.name?.value?.trim() || "";
    const mainDob = mainFields.dob?.value?.trim() || "";
    const mainGrade = mainFields.grade?.value?.trim() || "";
    const mainGender =
      Array.from(mainFields.genderRadios || []).find((r) => r.checked)?.value || "";

    if (mainName || mainDob || mainGrade || mainGender) {
      const academicSnippet = typeof getChildIgcseSummarySnippetHTML === "function"
        ? getChildIgcseSummarySnippetHTML("main")
        : "";

      html += `
        <div class="child-summary-card" data-child-id="main">
          <div class="child-summary-header">
            <strong>Child ${childNumber}: ${escapeHTML(mainName || "Student 1")}</strong>
            <button type="button" class="remove-summary-btn hide-in-pdf" data-child-id="main" title="Clear Child 1"
              style="background:#dc2626; color:#fff; border:none; padding:2px 7px; border-radius:4px; cursor:pointer; font-size:12px;">
              ✖
            </button>
          </div>
          <div class="child-summary-body">
            <div><strong>Name:</strong> ${escapeHTML(mainName || "—")}</div>
            <div><strong>Date of Birth:</strong> ${escapeHTML(mainDob || "—")}</div>
            <div><strong>Gender:</strong> ${escapeHTML(mainGender || "—")}</div>
            <div><strong>Grade:</strong> ${escapeHTML(mainGrade || "—")}</div>
            ${academicSnippet}
          </div>
        </div>
      `;
      childNumber++;
    }

    // 2. Added Children Blocks
    const extraBlocks = document.querySelectorAll(
      "#additionalChildrenContainer .child-block, #studentInfoSection .child-block:not(.main-child)"
    );
    const validExtraBlocks = Array.from(extraBlocks).filter(
      (b) => !b.closest("#childTemplate")
    );

    validExtraBlocks.forEach((block) => {
      const childId = block.dataset.childId;
      const name = block.querySelector(".studentName")?.value?.trim() || "";
      const dob = block.querySelector(".dob")?.value?.trim() || "";
      const grade =
        (block.querySelector(".childGradeSelect") || block.querySelector("select"))
          ?.value?.trim() || "";
      const gender =
        block.querySelector('input[type="radio"]:checked')?.value || "";

      if (name || dob || grade || gender) {
        const academicSnippet = (childId && typeof getChildIgcseSummarySnippetHTML === "function")
          ? getChildIgcseSummarySnippetHTML(childId)
          : "";

        html += `
          <div class="child-summary-card" data-child-id="${escapeHTML(childId)}">
            <div class="child-summary-header">
              <strong>Child ${childNumber}: ${escapeHTML(name || `Student ${childNumber}`)}</strong>
              <button type="button" class="remove-summary-btn hide-in-pdf" data-child-id="${escapeHTML(childId)}" title="Remove Child"
                style="background:#dc2626; color:#fff; border:none; padding:2px 7px; border-radius:4px; cursor:pointer; font-size:12px;">
                ✖
              </button>
            </div>
            <div class="child-summary-body">
              <div><strong>Name:</strong> ${escapeHTML(name || "—")}</div>
              <div><strong>Date of Birth:</strong> ${escapeHTML(dob || "—")}</div>
              <div><strong>Gender:</strong> ${escapeHTML(gender || "—")}</div>
              <div><strong>Grade:</strong> ${escapeHTML(grade || "—")}</div>
              ${academicSnippet}
            </div>
          </div>
        `;
        childNumber++;
      }
    });

    summaryDiv.innerHTML = html || "<em>No student data yet.</em>";

    // Attach click to each remove button in the summary
    summaryDiv.querySelectorAll(".remove-summary-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const childId = e.currentTarget.dataset.childId;

        if (childId === "main") {
          // Clear main student fields
          if (mainFields.name) mainFields.name.value = "";
          if (mainFields.dob) mainFields.dob.value = "";
          if (mainFields.grade) mainFields.grade.value = "";
          mainFields.genderRadios.forEach((r) => (r.checked = false));
          clearChildAcademicState("main");
          const mainSec = document.getElementById("igcseSubjectSection");
          if (mainSec) mainSec.style.display = "none";
        } else {
          // Remove specific child block
          const targetBlock = document.querySelector(`.child-block[data-child-id="${childId}"]`);
          if (targetBlock) targetBlock.remove();
          delete childrenAcademicState[childId];
        }

        window.generateSummaryHTML(); // Refresh summary
      });
    });
  };

  // Watch for main student input changes
  if (mainFields.name) mainFields.name.addEventListener("input", window.generateSummaryHTML);
  if (mainFields.dob) mainFields.dob.addEventListener("input", window.generateSummaryHTML);
  if (mainFields.grade) mainFields.grade.addEventListener("input", window.generateSummaryHTML);
  mainFields.genderRadios.forEach((r) =>
    r.addEventListener("change", window.generateSummaryHTML)
  );

  window.generateSummaryHTML();
});

// --- Detect staff name from URL and show it at the end of Page 2 ---
document.addEventListener("DOMContentLoaded", () => {
  const nameBox = document.getElementById("processedByName");
  if (!nameBox) return;

  // Read sentBy from URL
  const qs = new URLSearchParams(window.location.search);
  let sender = (qs.get("sentBy") || "").trim();

  // Optional short-code map
  const MAP = {
    ms: "Mustafa",
    sz: "Shahzor",
    mt: "Motasim",
    am: "Aamir",
  };
  if (!sender && qs.get("s")) sender = MAP[qs.get("s")] || "";

  // Capitalize first letter
  if (sender) {
    const formatted = sender.charAt(0).toUpperCase() + sender.slice(1);
    nameBox.textContent = formatted;
  } else {
    nameBox.textContent = "—"; // blank for simple link
  }
});

/* ---------- Guardian WhatsApp Country Dropdown (Search + Auto Code + Lock Code) ---------- */
function initGuardianWhatsAppDropdown() {
  const input = document.getElementById("gWhats");
  if (!input) return;

  // Basic tel settings
  input.setAttribute("inputmode", "tel");
  input.setAttribute("autocomplete", "tel");

  // Until a country is selected, user cannot type the number
  input.readOnly = true;
  let countrySelected = false;

  // Wrap input in a relative container
  const wrapper = document.createElement("div");
  wrapper.style.position = "relative";
  wrapper.style.width = "100%";

  const parent = input.parentNode;
  parent.insertBefore(wrapper, input);
  wrapper.appendChild(input);

  // Dropdown container
  const dropdown = document.createElement("div");
  dropdown.style.position = "absolute";
  dropdown.style.top = "100%";
  dropdown.style.left = "0";
  dropdown.style.right = "0";
  dropdown.style.zIndex = "50";
  dropdown.style.background = "#ffffff";
  dropdown.style.border = "1px solid #cbd5e1";
  dropdown.style.borderRadius = "6px";
  dropdown.style.marginTop = "4px";
  dropdown.style.boxShadow = "0 4px 12px rgba(15,23,42,0.12)";
  dropdown.style.display = "none";
  wrapper.appendChild(dropdown);

  // Search box
  const search = document.createElement("input");
  search.type = "text";
  search.placeholder = "Search country...";
  search.style.width = "100%";
  search.style.boxSizing = "border-box";
  search.style.padding = "6px 10px";
  search.style.border = "none";
  search.style.borderBottom = "1px solid #e2e8f0";
  search.style.outline = "none";
  dropdown.appendChild(search);

  // List
  const list = document.createElement("div");
  list.style.maxHeight = "190px";
  list.style.overflowY = "auto";
  dropdown.appendChild(list);

  // Country list
  const COUNTRIES = [
    { name: "Afghanistan", code: "AF", dial: "+93" },
    { name: "Albania", code: "AL", dial: "+355" },
    { name: "Algeria", code: "DZ", dial: "+213" },
    { name: "Andorra", code: "AD", dial: "+376" },
    { name: "Angola", code: "AO", dial: "+244" },
    { name: "Antigua and Barbuda", code: "AG", dial: "+1268" },
    { name: "Argentina", code: "AR", dial: "+54" },
    { name: "Armenia", code: "AM", dial: "+374" },
    { name: "Australia", code: "AU", dial: "+61" },
    { name: "Austria", code: "AT", dial: "+43" },
    { name: "Azerbaijan", code: "AZ", dial: "+994" },

    { name: "Bahamas", code: "BS", dial: "+1242" },
    { name: "Bahrain", code: "BH", dial: "+973" },
    { name: "Bangladesh", code: "BD", dial: "+880" },
    { name: "Barbados", code: "BB", dial: "+1246" },
    { name: "Belarus", code: "BY", dial: "+375" },
    { name: "Belgium", code: "BE", dial: "+32" },
    { name: "Belize", code: "BZ", dial: "+501" },
    { name: "Benin", code: "BJ", dial: "+229" },
    { name: "Bhutan", code: "BT", dial: "+975" },
    { name: "Bolivia", code: "BO", dial: "+591" },
    { name: "Bosnia and Herzegovina", code: "BA", dial: "+387" },
    { name: "Botswana", code: "BW", dial: "+267" },
    { name: "Brazil", code: "BR", dial: "+55" },
    { name: "Brunei Darussalam", code: "BN", dial: "+673" },
    { name: "Bulgaria", code: "BG", dial: "+359" },
    { name: "Burkina Faso", code: "BF", dial: "+226" },
    { name: "Burundi", code: "BI", dial: "+257" },

    { name: "Cabo Verde", code: "CV", dial: "+238" },
    { name: "Cambodia", code: "KH", dial: "+855" },
    { name: "Cameroon", code: "CM", dial: "+237" },
    { name: "Canada", code: "CA", dial: "+1" },
    { name: "Central African Republic", code: "CF", dial: "+236" },
    { name: "Chad", code: "TD", dial: "+235" },
    { name: "Chile", code: "CL", dial: "+56" },
    { name: "China", code: "CN", dial: "+86" },
    { name: "Colombia", code: "CO", dial: "+57" },
    { name: "Comoros", code: "KM", dial: "+269" },
    { name: "Congo", code: "CG", dial: "+242" },
    { name: "Congo, Democratic Republic", code: "CD", dial: "+243" },
    { name: "Costa Rica", code: "CR", dial: "+506" },
    { name: "Côte d’Ivoire", code: "CI", dial: "+225" },
    { name: "Croatia", code: "HR", dial: "+385" },
    { name: "Cuba", code: "CU", dial: "+53" },
    { name: "Cyprus", code: "CY", dial: "+357" },
    { name: "Czech Republic", code: "CZ", dial: "+420" },

    { name: "Denmark", code: "DK", dial: "+45" },
    { name: "Djibouti", code: "DJ", dial: "+253" },
    { name: "Dominica", code: "DM", dial: "+1767" },
    { name: "Dominican Republic", code: "DO", dial: "+1809" },

    { name: "Ecuador", code: "EC", dial: "+593" },
    { name: "Egypt", code: "EG", dial: "+20" },
    { name: "El Salvador", code: "SV", dial: "+503" },
    { name: "Equatorial Guinea", code: "GQ", dial: "+240" },
    { name: "Eritrea", code: "ER", dial: "+291" },
    { name: "Estonia", code: "EE", dial: "+372" },
    { name: "Eswatini", code: "SZ", dial: "+268" },
    { name: "Ethiopia", code: "ET", dial: "+251" },

    { name: "Fiji", code: "FJ", dial: "+679" },
    { name: "Finland", code: "FI", dial: "+358" },
    { name: "France", code: "FR", dial: "+33" },

    { name: "Gabon", code: "GA", dial: "+241" },
    { name: "Gambia", code: "GM", dial: "+220" },
    { name: "Georgia", code: "GE", dial: "+995" },
    { name: "Germany", code: "DE", dial: "+49" },
    { name: "Ghana", code: "GH", dial: "+233" },
    { name: "Greece", code: "GR", dial: "+30" },
    { name: "Grenada", code: "GD", dial: "+1473" },
    { name: "Guatemala", code: "GT", dial: "+502" },
    { name: "Guinea", code: "GN", dial: "+224" },
    { name: "Guinea-Bissau", code: "GW", dial: "+245" },
    { name: "Guyana", code: "GY", dial: "+592" },

    { name: "Haiti", code: "HT", dial: "+509" },
    { name: "Honduras", code: "HN", dial: "+504" },
    { name: "Hungary", code: "HU", dial: "+36" },

    { name: "Iceland", code: "IS", dial: "+354" },
    { name: "India", code: "IN", dial: "+91" },
    { name: "Indonesia", code: "ID", dial: "+62" },
    { name: "Iran", code: "IR", dial: "+98" },
    { name: "Iraq", code: "IQ", dial: "+964" },
    { name: "Ireland", code: "IE", dial: "+353" },
    { name: "Israel", code: "IL", dial: "+972" },
    { name: "Italy", code: "IT", dial: "+39" },

    { name: "Jamaica", code: "JM", dial: "+1876" },
    { name: "Japan", code: "JP", dial: "+81" },
    { name: "Jordan", code: "JO", dial: "+962" },

    { name: "Kazakhstan", code: "KZ", dial: "+7" },
    { name: "Kenya", code: "KE", dial: "+254" },
    { name: "Kiribati", code: "KI", dial: "+686" },
    { name: "Kuwait", code: "KW", dial: "+965" },
    { name: "Kyrgyzstan", code: "KG", dial: "+996" },

    { name: "Laos", code: "LA", dial: "+856" },
    { name: "Latvia", code: "LV", dial: "+371" },
    { name: "Lebanon", code: "LB", dial: "+961" },
    { name: "Lesotho", code: "LS", dial: "+266" },
    { name: "Liberia", code: "LR", dial: "+231" },
    { name: "Libya", code: "LY", dial: "+218" },
    { name: "Liechtenstein", code: "LI", dial: "+423" },
    { name: "Lithuania", code: "LT", dial: "+370" },
    { name: "Luxembourg", code: "LU", dial: "+352" },

    { name: "Madagascar", code: "MG", dial: "+261" },
    { name: "Malawi", code: "MW", dial: "+265" },
    { name: "Malaysia", code: "MY", dial: "+60" },
    { name: "Maldives", code: "MV", dial: "+960" },
    { name: "Mali", code: "ML", dial: "+223" },
    { name: "Malta", code: "MT", dial: "+356" },
    { name: "Marshall Islands", code: "MH", dial: "+692" },
    { name: "Mauritania", code: "MR", dial: "+222" },
    { name: "Mauritius", code: "MU", dial: "+230" },
    { name: "Mexico", code: "MX", dial: "+52" },
    { name: "Micronesia", code: "FM", dial: "+691" },
    { name: "Moldova", code: "MD", dial: "+373" },
    { name: "Monaco", code: "MC", dial: "+377" },
    { name: "Mongolia", code: "MN", dial: "+976" },
    { name: "Montenegro", code: "ME", dial: "+382" },
    { name: "Morocco", code: "MA", dial: "+212" },
    { name: "Mozambique", code: "MZ", dial: "+258" },
    { name: "Myanmar", code: "MM", dial: "+95" },

    { name: "Namibia", code: "NA", dial: "+264" },
    { name: "Nauru", code: "NR", dial: "+674" },
    { name: "Nepal", code: "NP", dial: "+977" },
    { name: "Netherlands", code: "NL", dial: "+31" },
    { name: "New Zealand", code: "NZ", dial: "+64" },
    { name: "Nicaragua", code: "NI", dial: "+505" },
    { name: "Niger", code: "NE", dial: "+227" },
    { name: "Nigeria", code: "NG", dial: "+234" },
    { name: "North Korea", code: "KP", dial: "+850" },
    { name: "North Macedonia", code: "MK", dial: "+389" },
    { name: "Norway", code: "NO", dial: "+47" },

    { name: "Oman", code: "OM", dial: "+968" },

    { name: "Pakistan", code: "PK", dial: "+92" },
    { name: "Palau", code: "PW", dial: "+680" },
    { name: "Palestine", code: "PS", dial: "+970" },
    { name: "Panama", code: "PA", dial: "+507" },
    { name: "Papua New Guinea", code: "PG", dial: "+675" },
    { name: "Paraguay", code: "PY", dial: "+595" },
    { name: "Peru", code: "PE", dial: "+51" },
    { name: "Philippines", code: "PH", dial: "+63" },
    { name: "Poland", code: "PL", dial: "+48" },
    { name: "Portugal", code: "PT", dial: "+351" },

    { name: "Qatar", code: "QA", dial: "+974" },

    { name: "Romania", code: "RO", dial: "+40" },
    { name: "Russia", code: "RU", dial: "+7" },
    { name: "Rwanda", code: "RW", dial: "+250" },

    { name: "Saint Kitts and Nevis", code: "KN", dial: "+1869" },
    { name: "Saint Lucia", code: "LC", dial: "+1758" },
    { name: "Saint Vincent and the Grenadines", code: "VC", dial: "+1784" },
    { name: "Samoa", code: "WS", dial: "+685" },
    { name: "San Marino", code: "SM", dial: "+378" },
    { name: "Sao Tome and Principe", code: "ST", dial: "+239" },
    { name: "Saudi Arabia", code: "SA", dial: "+966" },
    { name: "Senegal", code: "SN", dial: "+221" },
    { name: "Serbia", code: "RS", dial: "+381" },
    { name: "Seychelles", code: "SC", dial: "+248" },
    { name: "Sierra Leone", code: "SL", dial: "+232" },
    { name: "Singapore", code: "SG", dial: "+65" },
    { name: "Slovakia", code: "SK", dial: "+421" },
    { name: "Slovenia", code: "SI", dial: "+386" },
    { name: "Solomon Islands", code: "SB", dial: "+677" },
    { name: "Somalia", code: "SO", dial: "+252" },
    { name: "South Africa", code: "ZA", dial: "+27" },
    { name: "South Korea", code: "KR", dial: "+82" },
    { name: "South Sudan", code: "SS", dial: "+211" },
    { name: "Spain", code: "ES", dial: "+34" },
    { name: "Sri Lanka", code: "LK", dial: "+94" },
    { name: "Sudan", code: "SD", dial: "+249" },
    { name: "Suriname", code: "SR", dial: "+597" },
    { name: "Sweden", code: "SE", dial: "+46" },
    { name: "Switzerland", code: "CH", dial: "+41" },
    { name: "Syria", code: "SY", dial: "+963" },

    { name: "Taiwan", code: "TW", dial: "+886" },
    { name: "Tajikistan", code: "TJ", dial: "+992" },
    { name: "Tanzania", code: "TZ", dial: "+255" },
    { name: "Thailand", code: "TH", dial: "+66" },
    { name: "Timor-Leste", code: "TL", dial: "+670" },
    { name: "Togo", code: "TG", dial: "+228" },
    { name: "Tonga", code: "TO", dial: "+676" },
    { name: "Trinidad and Tobago", code: "TT", dial: "+1868" },
    { name: "Tunisia", code: "TN", dial: "+216" },
    { name: "Turkey", code: "TR", dial: "+90" },
    { name: "Turkmenistan", code: "TM", dial: "+993" },
    { name: "Tuvalu", code: "TV", dial: "+688" },

    { name: "Uganda", code: "UG", dial: "+256" },
    { name: "Ukraine", code: "UA", dial: "+380" },
    { name: "United Arab Emirates", code: "AE", dial: "+971" },
    { name: "United Kingdom", code: "GB", dial: "+44" },
    { name: "United States", code: "US", dial: "+1" },
    { name: "Uruguay", code: "UY", dial: "+598" },
    { name: "Uzbekistan", code: "UZ", dial: "+998" },

    { name: "Vanuatu", code: "VU", dial: "+678" },
    { name: "Vatican City", code: "VA", dial: "+39" },
    { name: "Venezuela", code: "VE", dial: "+58" },
    { name: "Vietnam", code: "VN", dial: "+84" },

    { name: "Yemen", code: "YE", dial: "+967" },

    { name: "Zambia", code: "ZM", dial: "+260" },
    { name: "Zimbabwe", code: "ZW", dial: "+263" },
  ];

  function renderList(filter = "") {
    const term = filter.trim().toLowerCase();
    list.innerHTML = "";

    COUNTRIES.filter((c) => {
      if (!term) return true;
      return (
        c.name.toLowerCase().includes(term) ||
        c.dial.replace("+", "").startsWith(term.replace("+", ""))
      );
    }).forEach((c) => {
      const item = document.createElement("div");
      item.textContent = `${c.name} (${c.dial})`;
      item.style.padding = "6px 10px";
      item.style.cursor = "pointer";
      item.style.fontSize = "13px";

      item.addEventListener("mouseenter", () => {
        item.style.background = "#e5f2ff";
      });
      item.addEventListener("mouseleave", () => {
        item.style.background = "transparent";
      });

      item.addEventListener("click", () => {
        applyCountry(c, true); // user selection
        closeDropdown();
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      });

      list.appendChild(item);
    });

    if (!list.innerHTML) {
      const empty = document.createElement("div");
      empty.textContent = "No matches";
      empty.style.padding = "6px 10px";
      empty.style.fontSize = "12px";
      empty.style.color = "#64748b";
      list.appendChild(empty);
    }
  }

  function applyCountry(country, fromUser = false) {
    const digits = input.value.replace(/\D/g, "");
    let local = "";

    if (input.dataset.currentCode) {
      const prevCode = input.dataset.currentCode;
      if (digits.startsWith(prevCode)) {
        local = digits.slice(prevCode.length);
      } else {
        local = digits;
      }
    } else {
      local = digits;
    }

    const sanitizedLocal = local ? local : "";
    input.value = country.dial + sanitizedLocal;
    input.dataset.currentCode = country.dial.replace(/\D/g, "");
    input.dataset.currentDial = country.dial;

    // Only when user selects from dropdown, allow typing number
    if (fromUser) {
      countrySelected = true;
      input.readOnly = false;
    }
  }

  function openDropdown() {
    dropdown.style.display = "block";
    renderList(search.value);
  }

  function closeDropdown() {
    dropdown.style.display = "none";
  }

  // Events
  input.addEventListener("focus", openDropdown);
  input.addEventListener("click", openDropdown);

  search.addEventListener("input", () => renderList(search.value));

  document.addEventListener("click", (e) => {
    if (!wrapper.contains(e.target)) {
      closeDropdown();
    }
  });

  // Input guard: if code is removed, lock everything
  input.addEventListener("input", () => {
    const dial = input.dataset.currentDial || "";

    // If no country is fixed yet
    if (!dial || !countrySelected) {
      input.value = "";
      input.readOnly = true;
      countrySelected = false;
      input.dataset.currentCode = "";
      input.dataset.currentDial = "";
      return;
    }

    // If user cleared everything
    if (!input.value.trim()) {
      input.value = "";
      input.readOnly = true;
      countrySelected = false;
      input.dataset.currentCode = "";
      input.dataset.currentDial = "";
      return;
    }

    // If value no longer starts with dial code => code removed
    if (!input.value.startsWith(dial)) {
      input.value = "";
      input.readOnly = true;
      countrySelected = false;
      input.dataset.currentCode = "";
      input.dataset.currentDial = "";
    }
  });

  // No default country now — user must select a country first
}

/* ==========================================================================
   MOBILE-FRIENDLY GRADE PICKER MODAL / BOTTOM SHEET (PHASE 6)
   ========================================================================== */

let activeGradeSelect = null;
let activeGradeTrigger = null;
let mobilePickerCloseTimer = null;

/**
 * Categorize a grade select <option> into one of the 4 defined categories:
 * 1. Foundation Stage (FS 1, FS 2, FS 3)
 * 2. Primary School (Grade 1 through Grade 7)
 * 3. FBISE (Grade 8 through Grade 12 FBISE)
 * 4. IGCSE / O-Level (Grade 8 through Grade 11 IGCSE / O'Level)
 */
function categorizeGradeOption(opt) {
  const val = (opt?.value || "").trim();
  const text = (opt?.textContent || opt?.innerText || val).trim();
  const curriculum = opt?.dataset?.curriculum || "";

  if (/^FS[\s\-]/i.test(val) || /^FS[\s\-]/i.test(text)) {
    return "Foundation Stage";
  }
  if (curriculum === "FBISE" || val.includes("FBISE") || text.includes("FBISE")) {
    return "FBISE";
  }
  if (
    curriculum === "IGCSE" ||
    val.includes("IGCSE") ||
    text.includes("IGCSE") ||
    val.includes("O'Level") ||
    text.includes("O'Level") ||
    val.includes("O-Level") ||
    text.includes("O-Level") ||
    val.includes("A'Level") ||
    text.includes("A'Level")
  ) {
    return "IGCSE / O-Level";
  }
  if (/^Grade\s+[1-7]\b/i.test(val) || /^Grade\s+[1-7]\b/i.test(text)) {
    return "Primary School";
  }
  return "Primary School";
}

/**
 * Synchronize the mobile trigger button display text with the current <select> value
 */
function syncMobileGradeTrigger(selectEl, triggerEl) {
  if (!selectEl) return;
  const trigger =
    triggerEl ||
    (selectEl.id ? document.querySelector(`.mobile-grade-trigger[data-target="${selectEl.id}"]`) : null) ||
    selectEl.closest(".grade-field-container")?.querySelector(".mobile-grade-trigger");

  if (!trigger) return;

  const valueDisplay = trigger.querySelector(".mobile-grade-value");
  if (!valueDisplay) return;

  const currentVal = selectEl.value;
  if (!currentVal) {
    valueDisplay.textContent = "Select Grade";
    valueDisplay.classList.add("placeholder");
  } else {
    const selectedOpt = Array.from(selectEl.options).find((o) => o.value === currentVal);
    valueDisplay.textContent = selectedOpt ? selectedOpt.textContent.trim() : currentVal;
    valueDisplay.classList.remove("placeholder");
  }
}

/**
 * Open the mobile grade picker bottom sheet for the given <select>
 */
function openMobileGradePicker(selectEl, triggerEl) {
  if (!selectEl) return;
  activeGradeSelect = selectEl;
  activeGradeTrigger = triggerEl;

  const modal = document.getElementById("mobileGradePickerModal");
  const body = document.getElementById("mobileGradeBody");
  if (!modal || !body) return;

  if (mobilePickerCloseTimer) {
    clearTimeout(mobilePickerCloseTimer);
    mobilePickerCloseTimer = null;
  }

  body.innerHTML = "";

  const CATEGORY_ORDER = [
    "Foundation Stage",
    "Primary School",
    "FBISE",
    "IGCSE / O-Level"
  ];

  const grouped = {
    "Foundation Stage": [],
    "Primary School": [],
    "FBISE": [],
    "IGCSE / O-Level": []
  };

  const options = Array.from(selectEl.options).filter((o) => o.value !== "");

  options.forEach((opt) => {
    const cat = categorizeGradeOption(opt);
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(opt);
  });

  const currentValue = selectEl.value;
  let selectedButton = null;

  CATEGORY_ORDER.forEach((catName) => {
    const items = grouped[catName] || [];
    if (items.length === 0) return;

    const catDiv = document.createElement("div");
    catDiv.className = "mobile-grade-category";

    const titleDiv = document.createElement("div");
    titleDiv.className = "mobile-grade-cat-title";
    titleDiv.textContent = catName;
    catDiv.appendChild(titleDiv);

    const optsDiv = document.createElement("div");
    optsDiv.className = "mobile-grade-cat-options";

    items.forEach((opt) => {
      const isSelected = opt.value === currentValue;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `mobile-grade-opt-btn ${isSelected ? "selected" : ""}`;
      btn.setAttribute("role", "option");
      btn.setAttribute("aria-selected", isSelected ? "true" : "false");
      btn.dataset.value = opt.value;

      const labelSpan = document.createElement("span");
      labelSpan.className = "opt-label";
      labelSpan.textContent = opt.textContent.trim();

      const checkSpan = document.createElement("span");
      checkSpan.className = "opt-check";
      checkSpan.textContent = "✓";

      btn.appendChild(labelSpan);
      btn.appendChild(checkSpan);

      btn.addEventListener("click", () => {
        selectEl.value = opt.value;
        syncMobileGradeTrigger(selectEl, triggerEl);
        closeMobileGradePicker();
        // Dispatch change and input events to trigger all Phase 1-5 academic logic & summary updates
        selectEl.dispatchEvent(new Event("change", { bubbles: true }));
        selectEl.dispatchEvent(new Event("input", { bubbles: true }));
      });

      optsDiv.appendChild(btn);

      if (isSelected) {
        selectedButton = btn;
      }
    });

    catDiv.appendChild(optsDiv);
    body.appendChild(catDiv);
  });

  modal.style.display = "flex";
  // Force reflow
  void modal.offsetHeight;
  modal.classList.add("is-active");
  modal.setAttribute("aria-hidden", "false");
  if (triggerEl) triggerEl.setAttribute("aria-expanded", "true");
  document.body.classList.add("modal-open");

  if (selectedButton) {
    setTimeout(() => {
      try {
        selectedButton.scrollIntoView({ block: "center", behavior: "auto" });
        selectedButton.focus();
      } catch {}
    }, 40);
  } else {
    const closeBtn = document.getElementById("mobileGradeCloseBtn");
    if (closeBtn) closeBtn.focus();
  }
}

/**
 * Close the mobile grade picker bottom sheet
 */
function closeMobileGradePicker() {
  const modal = document.getElementById("mobileGradePickerModal");
  if (!modal || !modal.classList.contains("is-active")) return;

  modal.classList.remove("is-active");
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");

  if (activeGradeTrigger) {
    activeGradeTrigger.setAttribute("aria-expanded", "false");
    try {
      activeGradeTrigger.focus();
    } catch {}
  }

  mobilePickerCloseTimer = setTimeout(() => {
    modal.style.display = "none";
  }, 280);
}

/**
 * Bind click and synchronization events to a mobile trigger button
 */
function bindMobileGradeTrigger(triggerEl, selectEl) {
  if (!triggerEl) return;
  const select =
    selectEl ||
    (triggerEl.dataset.target ? document.getElementById(triggerEl.dataset.target) : null) ||
    triggerEl.closest(".grade-field-container")?.querySelector("select.grade-select-native, select");

  if (!select) return;

  // Sync initial state
  syncMobileGradeTrigger(select, triggerEl);

  // Open modal on trigger tap
  triggerEl.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    openMobileGradePicker(select, triggerEl);
  });

  // Keep trigger display synchronized if select value changes programmatically or externally
  select.addEventListener("change", () => syncMobileGradeTrigger(select, triggerEl));
  select.addEventListener("input", () => syncMobileGradeTrigger(select, triggerEl));
}

/**
 * Initialize the mobile grade picker modal system
 */
function initMobileGradePicker() {
  const modal = document.getElementById("mobileGradePickerModal");
  if (!modal) return;

  // Close button
  const closeBtn = document.getElementById("mobileGradeCloseBtn");
  if (closeBtn) {
    closeBtn.addEventListener("click", (e) => {
      e.preventDefault();
      closeMobileGradePicker();
    });
  }

  // Backdrop click dismissal
  const backdrop = document.getElementById("mobileGradeBackdrop");
  if (backdrop) {
    backdrop.addEventListener("click", () => {
      closeMobileGradePicker();
    });
  }

  // Escape key support
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal.classList.contains("is-active")) {
      closeMobileGradePicker();
    }
  });

  // Bind existing triggers
  const triggers = document.querySelectorAll(".mobile-grade-trigger");
  triggers.forEach((trig) => {
    bindMobileGradeTrigger(trig);
  });
}

// Global exposure for window / test execution
if (typeof window !== "undefined") {
  window.categorizeGradeOption = categorizeGradeOption;
  window.syncMobileGradeTrigger = syncMobileGradeTrigger;
  window.openMobileGradePicker = openMobileGradePicker;
  window.closeMobileGradePicker = closeMobileGradePicker;
  window.bindMobileGradeTrigger = bindMobileGradeTrigger;
  window.initMobileGradePicker = initMobileGradePicker;
}


/* public/script.js
   IVS Admission Form — signature pad + PDF export + print + WhatsApp (app) share
*/
document.addEventListener("DOMContentLoaded", () => {
  initSignaturePad();
  wireButtons();
  initSingleGradeSelect();   // <<< make Grade checkboxes single-select
  autoFillRegDate();         // <<< NEW: auto-fill DATE OF REGISTRATION with today's date
   initDeclarationMaster();   // <<< NEW
});

/* ---------- NEW: Auto-fill DATE OF REGISTRATION (MM/DD/YYYY boxes) ---------- */
function autoFillRegDate() {
  const container = document.getElementById("regBoxes");
  if (!container) return;

  const boxes = Array.from(container.querySelectorAll(".box"));
  if (!boxes.length) return;

  // If user already typed something, don't overwrite
  const anyFilled = boxes.some(b => (b.value || "").trim() !== "");
  if (anyFilled) return;

  const now = new Date();
  // current date -> MM/DD/YYYY (boxes expect this order)
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const yyyy = String(now.getFullYear());

  const seq = (mm + dd + yyyy).split(""); // "MMDDYYYY"
  boxes.forEach((b, i) => { if (i < seq.length) b.value = seq[i]; });

  // hidden ISO for backend if present
  const hidden = document.getElementById("regDate");
  if (hidden) hidden.value = `${yyyy}-${mm}-${dd}`;
}

/* ---------- 1) SIGNATURE PAD (mouse + touch) ---------- */
let sigCanvas, sigCtx, isDrawing = false, lastPoint = null;

function initSignaturePad() {
  sigCanvas = document.getElementById("sig");
  if (!sigCanvas) return; // not on this page

  sigCtx = sigCanvas.getContext("2d");
  sigCtx.lineWidth = 2;
  sigCtx.lineCap  = "round";
  sigCtx.strokeStyle = "#0f172a";

  const getPos = (e) => {
    const t = e.touches ? e.touches[0] : e;
    const r = sigCanvas.getBoundingClientRect();
    return {
      x: (t.clientX - r.left) * (sigCanvas.width  / r.width),
      y: (t.clientY - r.top)  * (sigCanvas.height / r.height)
    };
  };

  const start = (e) => { isDrawing = true; lastPoint = getPos(e); e.preventDefault(); };
  const move  = (e) => {
    if (!isDrawing) return;
    const p = getPos(e);
    sigCtx.beginPath();
    sigCtx.moveTo(lastPoint.x, lastPoint.y);
    sigCtx.lineTo(p.x, p.y);
    sigCtx.stroke();
    lastPoint = p;
    e.preventDefault();
  };
  const end   = () => { isDrawing = false; lastPoint = null; };

  // Mouse
  sigCanvas.addEventListener("mousedown", start);
  sigCanvas.addEventListener("mousemove", move);
  document.addEventListener("mouseup", end);

  // Touch
  sigCanvas.addEventListener("touchstart", start, { passive: false });
  sigCanvas.addEventListener("touchmove", move,   { passive: false });
  sigCanvas.addEventListener("touchend", end);

  // Clear
  const clr = document.getElementById("clearSig");
  if (clr) clr.addEventListener("click", () => {
    sigCtx.clearRect(0, 0, sigCanvas.width, sigCanvas.height);
  });
}

/* ---------- 2) BUTTONS: PDF ---------- */

// keep this number only for fallback text; native share lets the user pick the contact
const SCHOOL_WHATSAPP = "923355245551"; // 92 + phone (no plus sign)

function wireButtons() {
  const pdfBtn = document.getElementById("btnPdf");
  if (pdfBtn) pdfBtn.addEventListener("click", () => exportPdfAndOpenWhatsAppApp());
}

/* Utility for signature if needed elsewhere */
function getSignatureDataURL() {
  if (!sigCanvas) return "";
  const blank = document.createElement("canvas");
  blank.width = sigCanvas.width;
  blank.height = sigCanvas.height;
  if (sigCanvas.toDataURL() === blank.toDataURL()) return "";
  return sigCanvas.toDataURL("image/png");
}
/* ---------- 3) Build PDF from .page elements (A4, top-aligned) ---------- */
async function buildPdfFromPages() {
  const { jsPDF } = window.jspdf;

 // Collect all children before creating PDF (optional old part, can be removed if not needed)
const studentBlocks = document.querySelectorAll(".child-block, .grades");
let extraData = "";
studentBlocks.forEach((block, i) => {
  const name = block.querySelector(".studentName")?.value || document.getElementById("studentName")?.value || "";
  const dob = block.querySelector(".dob")?.value || document.getElementById("dob")?.value || "";
  const grade = block.querySelector("select")?.value || document.getElementById("gradeSelect")?.value || "";
  const gender = block.querySelector('input[type="radio"]:checked')?.value || 
                 document.querySelector('input[name="gender"]:checked')?.value || "";

  if (name || dob || grade || gender) {
    extraData += `Child ${i + 1}:\nName: ${name}\nDOB: ${dob}\nGender: ${gender}\nGrade: ${grade}\n\n`;
  }
});
// ✅ Make sure summary is updated before PDF capture
if (typeof generateSummaryHTML === "function") generateSummaryHTML();

// ✅ Move this line here, before hiding footer
const pages = Array.from(document.querySelectorAll(".page"));
   if (!pages.length) return null;

// export mode: hide fixed footer
document.body.classList.add("pdf-export");
const infoBar = document.querySelector(".info-bar");
const prevBarDisp = infoBar ? infoBar.style.display : null;
if (infoBar) infoBar.style.display = "none";

  // ensure images are ready (logos, etc.)
  await Promise.all(
    Array.from(document.images).map(img => {
      if (img.complete) return Promise.resolve();
      return new Promise(res => { img.onload = img.onerror = res; });
    })
  );

  const pdf = new jsPDF("p", "pt", "a4");
  const pageW = pdf.internal.pageSize.getWidth();   // ~595pt
  const pageH = pdf.internal.pageSize.getHeight();  // ~842pt
  const M = 18;

  for (let i = 0; i < pages.length; i++) {
    const el = pages[i];

    const canvas = await html2canvas(el, {
      scale: 2.2,
      useCORS: true,
      allowTaint: false,
      backgroundColor: "#ffffff",
      logging: false,
      windowWidth: 980,
      scrollX: 0,         // کوئی اسکرول آفسیٹ نہیں
      scrollY: 0
    });

    const img = canvas.toDataURL("image/jpeg", 0.95);
    if (i > 0) pdf.addPage();
    pdf.addImage(img, "JPEG",0, 0, 595, 842);
  }

  // restore UI
  if (infoBar) infoBar.style.display = prevBarDisp || "";
  document.body.classList.remove("pdf-export");

  const filename = `IVS-Admission-${new Date().toISOString().slice(0,10)}.pdf`;
  return { pdf, filename };
}

/* ---------- 4) Send Data + Export PDF + WhatsApp ---------- */
async function exportPdfAndOpenWhatsAppApp() {
  // Master "I agree" لازمی
  const master = document.getElementById('declMaster');
  if (master && !master.checked) {
    alert('Please tick the "I agree" checkbox to proceed.');
    return;
  }

  // (اختیاری) اگر آپ 1–10 والے hidden/رکھے ہوئے چیک باکس بھی ساتھ ٹک کرانا چاہتے ہیں:
  document.querySelectorAll('.declaration-list input.decl')
    .forEach(cb => cb.checked = true);

  // ---- یہاں سے آپ کا موجودہ PDF + WhatsApp والا کوڈ as-is رہے گا ----
}


/* ---------- 4) Share to WhatsApp APP with attached PDF (native share) ---------- */
async function exportPdfAndOpenWhatsAppApp() {
  const built = await buildPdfFromPages();
  if (!built) return;
  const { pdf, filename } = built;

  // Build a File for Web Share API (required for attaching to WhatsApp)
  const blob = pdf.output("blob");
  const file = new File([blob], filename, { type: "application/pdf" });

  const student = document.getElementById("studentName")?.value?.trim() || "student";
  const caption =
    `IVS Admission Form for ${student}\n` +
    `Session: 2025–26\n\n` +
    `Please review the attached PDF. Thank you.`;

  try {
    // ✅ Best path: native share with FILES (Android Chrome, iOS Safari 16.4+ over HTTPS)
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        files: [file],
        title: "IVS Admission Form",
        text: caption
      });

      // optional: also save a local copy for the user
      try { pdf.save(filename); } catch {}
      return; // stop here — user is now in WhatsApp app with the file attached
    }
  } catch (err) {
    console.warn("Native share failed, will fallback:", err);
  }

  // ❗ Fallbacks (no WhatsApp Web):
  // 1) Save the PDF locally so the user can attach inside WhatsApp app
  try { pdf.save(filename); } catch {}

  // 2) Try to open WhatsApp app with a helpful prefilled text (cannot attach via URL)
  // On many phones, this deep link opens the app directly.
  const helper =
    `Assalamu Alaikum. I have saved my admission form PDF (${filename}). ` +
    `I will attach the file here and send.`;
  const deepLink = `whatsapp://send?text=${encodeURIComponent(helper)}`;

  // Try deep link first (opens app on mobile). If it fails silently, show a tip.
  window.location.href = deepLink;

  // As a final hint if nothing happens (desktop, unsupported), guide the user.
  setTimeout(() => {
    alert("If WhatsApp didn’t open automatically, please open the WhatsApp app and attach the saved PDF from your downloads.");
  }, 1200);
}

/* ---------- 5) Grade: force single selection (radio-like) ---------- */
function initSingleGradeSelect() {
  const grid = document.querySelector(".grades"); // container of grade boxes
  if (!grid) return;

  const inputs = Array.from(grid.querySelectorAll('input[type="checkbox"]'));

  // A) Page load: if multiple are checked (e.g., after refresh/auto-fill), keep only the first
  const initiallyChecked = inputs.filter(i => i.checked);
  if (initiallyChecked.length > 1) {
    initiallyChecked.slice(1).forEach(i => (i.checked = false));
  }

  // B) Make them behave like radios:
  //    - pointerdown fires before the browser toggles the checkbox,
  //      so if the user is about to check a new one, clear others first.
  inputs.forEach(inp => {
    inp.addEventListener("pointerdown", () => {
      if (!inp.checked) { // it's about to become checked
        inputs.forEach(o => { if (o !== inp) o.checked = false; });
      }
    });

    // Safety net: after the change, ensure only one remains checked
    inp.addEventListener("change", (e) => {
      if (e.target.checked) {
        inputs.forEach(o => { if (o !== e.target) o.checked = false; });
      }
    });
  });
}
function initDeclarationMaster() {
  const master = document.getElementById('declMaster');   // "I agree" checkbox
  const btn    = document.getElementById('btnPdf');       // PDF button

  if (!master || !btn) return;

  // بٹن کی حالت سیٹ کریں (blur / active)
  const setBtnState = () => {
    if (master.checked) {
      btn.removeAttribute('aria-disabled');
      btn.style.pointerEvents = "auto";   // ✅ clickable
      btn.style.opacity = "1";            // ✅ visible active
    } else {
      btn.setAttribute('aria-disabled', 'true');
      btn.style.pointerEvents = "none";   // ✅ completely unclickable
      btn.style.opacity = "0.5";          // ✅ visually disabled
    }
  };

  // صفحہ لوڈ ہوتے ہی بٹن کی حالت سیٹ کریں
  setBtnState();

  // جب checkbox بدلے تو بٹن کی حالت اپڈیٹ کریں
  master.addEventListener('change', setBtnState);

  // اگر tick نہیں ہوا تو alert دکھا کر روک دو
  btn.addEventListener('click', (e) => {
    if (!master.checked) {
      e.preventDefault();
      e.stopImmediatePropagation(); // ✅ event کو مکمل طور پر روک دے
      alert('Please tick the “I agree” checkbox to proceed.');
      try { master.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch {}
      return false;
    }
  });
}
/* ---------- ADD ANOTHER CHILD (HTML Template Version - Adjusted Placement) ---------- */
document.addEventListener("DOMContentLoaded", () => {
  const addBtn = document.getElementById("addChildBtn");
  const template = document.getElementById("childTemplate");
  // ✅ نیا target: Student Information سیکشن کے اندر والا .content
  const studentContainer =
  document.querySelector("#studentInfoSection .content") ||
  document.getElementById("studentInfoSection");

  if (!addBtn || !template || !studentContainer) return;


  let index = 1;

  addBtn.addEventListener("click", () => {
    index++;
    const clone = template.cloneNode(true);
    clone.style.display = "block";
    clone.id = ""; // remove duplicate ID
    clone.innerHTML = clone.innerHTML.replace(/__INDEX__/g, index);

    (studentContainer || document.body).appendChild(clone);


    // Attach remove event to this clone
    const removeBtn = clone.querySelector(".removeChildBtn");
    if (removeBtn) {
      removeBtn.addEventListener("click", () => {
        clone.remove();
        // ✅ Update summary immediately after removing child
        if (typeof generateSummaryHTML === "function") {
          generateSummaryHTML();
        }
      });
    }

    // Smooth scroll to new section
    clone.scrollIntoView({ behavior: "smooth", block: "center" });

    // ✅ New inputs will also update summary when user types
    setTimeout(() => {
      const newInputs = clone.querySelectorAll("input, select");
      newInputs.forEach(inp =>
        inp.addEventListener("input", () => {
          if (typeof generateSummaryHTML === "function") generateSummaryHTML();
        })
      );
      const radios = clone.querySelectorAll('input[type="radio"]');
      radios.forEach(r =>
        r.addEventListener("change", () => {
          if (typeof generateSummaryHTML === "function") generateSummaryHTML();
        })
      );
    }, 200);

    // ✅ Update summary after adding child
    if (typeof generateSummaryHTML === "function") {
      generateSummaryHTML();
    }
  });
});

/* ---------- LIVE STUDENT SUMMARY CREATION ---------- */
document.addEventListener("DOMContentLoaded", () => {
  const summaryDiv = document.getElementById("studentSummary");
  const addChildBtn = document.getElementById("addChildBtn");
  const mainFields = {
    name: document.getElementById("studentName"),
    dob: document.getElementById("dob"),
    grade: document.getElementById("gradeSelect"),
    genderRadios: document.querySelectorAll('input[name="gender"]')
  };

  window.generateSummaryHTML = function () {
    let html = "";
    let index = 1;

    // 🧒 Main Student Info
    const mainGender = Array.from(mainFields.genderRadios).find(r => r.checked)?.value || "";
    if (mainFields.name.value || mainFields.dob.value || mainFields.grade.value) {
      html += `
        <div class="child-summary" data-index="main">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <strong>Child ${index}:</strong>
            <button type="button" class="remove-summary-btn hide-in-pdf" 
              style="background:#dc2626;color:#fff;border:none;padding:2px 6px;
                     border-radius:4px;cursor:pointer;font-size:12px;">
              ✖
            </button>
          </div>
          Name: ${mainFields.name.value || ""}<br>
          DOB: ${mainFields.dob.value || ""}<br>
          Gender: ${mainGender}<br>
          Grade: ${mainFields.grade.value || ""}
        </div><hr class="sep">`;
      index++;
    }

    // 👶 Added Child Blocks
    const childBlocks = document.querySelectorAll(".child-block");
    childBlocks.forEach((block, i) => {
      const name = block.querySelector(".studentName")?.value || "";
      const dob = block.querySelector(".dob")?.value || "";
      const grade = block.querySelector("select")?.value || "";
      const gender = block.querySelector('input[type="radio"]:checked')?.value || "";

      if (name || dob || grade) {
        html += `
          <div class="child-summary" data-index="${i}">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <strong>Child ${index}:</strong>
              <button type="button" class="remove-summary-btn hide-in-pdf" 
                style="background:#dc2626;color:#fff;border:none;padding:2px 6px;
                       border-radius:4px;cursor:pointer;font-size:12px;">
                ✖
              </button>
            </div>
            Name: ${name}<br>
            DOB: ${dob}<br>
            Gender: ${gender}<br>
            Grade: ${grade}
          </div><hr class="sep">`;
        index++;
      }
    });

    summaryDiv.innerHTML = html || "<em>No student data yet.</em>";

    // 🎯 Attach click to each ❌ button
    summaryDiv.querySelectorAll(".remove-summary-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const blockIndex = e.target.closest(".child-summary").dataset.index;

        if (blockIndex === "main") {
          // Clear main student data
          mainFields.name.value = "";
          mainFields.dob.value = "";
          mainFields.grade.value = "";
          mainFields.genderRadios.forEach(r => (r.checked = false));
        } else {
          // Remove specific child block
          const childBlocks = document.querySelectorAll(".child-block");
          if (childBlocks[blockIndex]) childBlocks[blockIndex].remove();
        }

        generateSummaryHTML(); // Refresh summary
      });
    });
  };

  // 🎯 Watch for main student input changes
  [mainFields.name, mainFields.dob, mainFields.grade].forEach(el =>
    el.addEventListener("input", generateSummaryHTML)
  );
  mainFields.genderRadios.forEach(r => r.addEventListener("change", generateSummaryHTML));

  // 🎯 When Add Another Child button clicked
  if (addChildBtn) {
    addChildBtn.addEventListener("click", () => {
      setTimeout(() => {
        const newBlock = document.querySelectorAll(".child-block:last-child input, .child-block:last-child select");
        newBlock.forEach(inp => inp.addEventListener("input", generateSummaryHTML));
        const radios = document.querySelectorAll(".child-block:last-child input[type='radio']");
        radios.forEach(r => r.addEventListener("change", generateSummaryHTML));
      }, 300);
    });
  }

  generateSummaryHTML();
});
// --- Detect staff name from URL and show it at the end of Page 2 ---
document.addEventListener("DOMContentLoaded", () => {
  const nameBox = document.getElementById("processedByName");
  if (!nameBox) return;

  // URL سے sentBy پڑھیں
  const qs = new URLSearchParams(window.location.search);
  let sender = (qs.get("sentBy") || "").trim();

  // چاہیں تو short-codes map کر دیں (اختیاری)
  const MAP = {
    ms: "Mustafa",
    sz: "Shahzor",
    mt: "Motasim",
    am: "Aamir"
  };
  if (!sender && qs.get("s")) sender = MAP[qs.get("s")] || "";

  // Format: پہلا حرف بڑا، باقی جیسا بھی آئے
  if (sender) {
    const formatted = sender.charAt(0).toUpperCase() + sender.slice(1);
    nameBox.textContent = formatted;
  } else {
    nameBox.textContent = "—"; // simple link پر blank رہے گا
  }
});

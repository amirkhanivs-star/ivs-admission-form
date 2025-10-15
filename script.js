/* public/script.js
   IVS Admission Form — signature pad + PDF export + print + WhatsApp (app) share
*/
document.addEventListener("DOMContentLoaded", () => {
  initSignaturePad();
  wireButtons();
  initSingleGradeSelect();   // <<< make Grade checkboxes single-select
  autoFillRegDate();         // <<< NEW: auto-fill DATE OF REGISTRATION with today's date
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

/* ---------- 2) BUTTONS: PDF + Print ---------- */

// keep this number only for fallback text; native share lets the user pick the contact
const SCHOOL_WHATSAPP = "923355245551"; // 92 + phone (no plus sign)

function wireButtons() {
  const pdfBtn = document.getElementById("btnPdf");
  if (pdfBtn) pdfBtn.addEventListener("click", () => exportPdfAndOpenWhatsAppApp());

  const printBtn = document.getElementById("btnPrint");
  if (printBtn) printBtn.addEventListener("click", () => {
    const bar = document.querySelector(".info-bar");
    const prev = bar ? bar.style.display : null;
    if (bar) bar.style.display = "none";
    window.print();
    if (bar) bar.style.display = prev || "";
  });

  // if you still have a form submit somewhere, leave it as-is
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
      windowWidth: document.documentElement.scrollWidth,
      scrollY: -window.scrollY
    });

    const img = canvas.toDataURL("image/jpeg", 0.95);
    const wpx = canvas.width, hpx = canvas.height;

    // fit inside A4 while preserving aspect — top aligned
    let ratio = (pageW - 2 * M) / wpx; // fit width
    let wpt = wpx * ratio, hpt = hpx * ratio;
    if (hpt > pageH - 2 * M) {         // too tall? fit height
      ratio = (pageH - 2 * M) / hpx;
      wpt = wpx * ratio;
      hpt = hpx * ratio;
    }

    const x = (pageW - wpt) / 2; // center horizontally
    const y = M;                 // top aligned

    if (i > 0) pdf.addPage();
    pdf.addImage(img, "JPEG", x, y, wpt, hpt, "", "FAST");
  }

  // restore UI
  if (infoBar) infoBar.style.display = prevBarDisp || "";
  document.body.classList.remove("pdf-export");

  const filename = `IVS-Admission-${new Date().toISOString().slice(0,10)}.pdf`;
  return { pdf, filename };
}

/* ---------- 4) Share to WhatsApp APP with attached PDF (native share) ---------- */
/* ---------- 4) Share to WhatsApp APP with attached PDF (native share) ---------- */
async function exportPdfAndOpenWhatsAppApp() {
  // ===== GUARD: Require all declaration checkboxes to be checked =====
  // We try multiple selectors so it works with your current HTML structure.
  const candidates = document.querySelectorAll(
    '.declaration-list input[type="checkbox"], input[type="checkbox"][name^="decl"], input[type="checkbox"].decl, input[type="checkbox"][data-decl]'
  );
  const declBoxes = Array.from(candidates);

  // Only enforce if there ARE declaration checkboxes on the page
  if (declBoxes.length > 0) {
    const unchecked = declBoxes.filter(cb => !cb.checked);
    if (unchecked.length > 0) {
      alert('Please tick all declaration points (1–10) to complete your admission.');
      // optional UX: take user to the first unchecked box
      try {
        unchecked[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
        unchecked[0].focus();
      } catch (_) {}
      return; // stop here — do not create/share PDF
    }
  }
  // ===== /GUARD =====

  // Build PDF
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
    // ✅ Native share with file (WhatsApp app attach)
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        files: [file],
        title: "IVS Admission Form",
        text: caption
      });

      // optional: also save a local copy for the user
      try { pdf.save(filename); } catch {}
      return; // user is now in WhatsApp app with the file attached
    }
  } catch (err) {
    console.warn("Native share failed, will fallback:", err);
  }

  // ❗ Fallbacks: save locally + open WhatsApp app with helper text (no auto-attach possible via URL)
  try { pdf.save(filename); } catch {}

  const helper =
    `Assalamu Alaikum. I have saved my admission form PDF (${filename}). ` +
    `I will attach the file here and send.`;
  const deepLink = `whatsapp://send?text=${encodeURIComponent(helper)}`;
  window.location.href = deepLink;

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


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
/* ===== Mobile auto-scale: fill 100% screen width, no side bg ===== */
(function(){
  const A4_WIDTH = 794; // your .page ki design width

  function ensureWrappers(){
    document.querySelectorAll('.page').forEach(p => {
      if (!p.parentElement.classList.contains('page-zoom-wrap')) {
        const w = document.createElement('div');
        w.className = 'page-zoom-wrap';
        p.parentNode.insertBefore(w, p);
        w.appendChild(p);
      }
    });
  }

  function fitPages(){
    const vw = Math.min(window.innerWidth, document.documentElement.clientWidth || window.innerWidth);
    const wraps = document.querySelectorAll('.page-zoom-wrap');
    const pages = document.querySelectorAll('.page');
    if (!pages.length) return;

    // Desktop: koi scaling nahi
    if (vw >= A4_WIDTH + 2){
      pages.forEach(p => { p.style.transform=''; p.classList.remove('is-scaled'); });
      wraps.forEach(w => { w.style.height=''; w.style.overflow=''; w.style.width='100%'; });
      return;
    }

    // Mobile: bilkul screen width ke barabar scale (no gutter)
    const scale = vw / A4_WIDTH;

    pages.forEach((p, i) => {
      // natural (unscaled) height nikaal lo
      const naturalHeight = p.offsetHeight / (p.style.transform?.includes('scale(') ? parseFloat(p.style.transform.match(/scale\((.+?)\)/)?.[1] || 1) : 1);

      p.style.transform = `scale(${scale})`;
      p.classList.add('is-scaled');

      const wrap = wraps[i];
      wrap.style.height = (naturalHeight * scale) + 'px';
      wrap.style.width  = '100vw';
      wrap.style.overflow = 'hidden';
    });
  }

  function initAutoScale(){
    ensureWrappers();
    fitPages();
    window.addEventListener('resize', fitPages, { passive:true });
    window.addEventListener('orientationchange', fitPages);
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', initAutoScale);
  } else {
    initAutoScale();
  }
})();

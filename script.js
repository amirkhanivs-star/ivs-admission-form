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

/* ---------- 3) Build PDF from .page elements (A4, FULL-BLEED) ---------- */
/* یہ ورژن موبائل/پی سی دونوں پر بالکل ایک جیسا PDF بناتا ہے
   1) CSS کی کلاس .pdf-export آن کر کے لی آؤٹ کو "ڈیسک ٹاپ جیسا" فریز کر دیتا ہے
   2) html2canvas کو فکسڈ چوڑائی (980px) دیتا ہے تاکہ اسنیپ شاٹ ہر ڈیوائس پر ایک جیسا ہو
   3) jsPDF میں پورا A4 بھر دیتا ہے (0,0,595,842) — اس سے کناروں پر سفید جگہ نہیں رہتی
   4) امیجز/لوگوز مکمل لوڈ ہونے کا انتظار کرتا ہے، تاکہ بینر یا لوگو کٹ نہ جائیں
*/
async function buildPdfFromPages() {
  const { jsPDF } = window.jspdf;

  // 0) اگر پیجز ہی نہیں ہیں تو واپس چلے جائیں
  const pages = Array.from(document.querySelectorAll(".page"));
  if (!pages.length) return null;

  // 1) PDF موڈ آن: CSS میں .pdf-export آپ کا لی آؤٹ (page width, padding, banner margins, info-bar hide)
  //    ڈیسک ٹاپ جیسا "فریز" کر دے گا۔ اسی لئے پی سی/موبائل پر نتیجہ ایک جیسا آتا ہے۔
  document.body.classList.add("pdf-export");

  // 2) تمام امیجز/لوگوز لوڈ ہونے کا انتظار — ورنہ html2canvas جزوی امیج کیپچر کر لیتا ہے
  await Promise.all(
    Array.from(document.images).map(img =>
      img.complete ? Promise.resolve() : new Promise(res => (img.onload = img.onerror = res))
    )
  );

  // 3) jsPDF A4 کینوس تیار
  const pdf = new jsPDF("p", "pt", "a4"); // Portrait, point units, A4
  const PAGE_W = pdf.internal.pageSize.getWidth();   // 595pt
  const PAGE_H = pdf.internal.pageSize.getHeight();  // 842pt

  // 4) ہر .page کو html2canvas سے پکڑیں
  for (let i = 0; i < pages.length; i++) {
    const el = pages[i];

    // html2canvas کیلئے فکسڈ snapshot سیٹنگز:
    // - windowWidth: 980 => آپ کی CSS کی ڈیسک ٹاپ max-width سے میچ
    // - scrollX/scrollY: 0 => اسکرول آفسیٹ کا اثر ختم
    // - scale: 2 => اچھی کوالٹی/سائز بیلنس
    const canvas = await html2canvas(el, {
      backgroundColor: "#ffffff",
      useCORS: true,
      allowTaint: false,
      scale: 2,
      windowWidth: 980,
      scrollX: 0,
      scrollY: 0,
      logging: false
    });

    const img = canvas.toDataURL("image/jpeg", 0.95);

    // پہلی کے بعد نئی A4 پیج
    if (i > 0) pdf.addPage();

    // 5) FULL-BLEED: پورا A4 بھر دیں — اس سے مرون بارڈر/فریم کٹا نہیں لگے گا
    // نوٹ: یہاں کوئی مارجن/fit-calculation نہیں، سیدھا 595×842
    pdf.addImage(img, "JPEG", 0, 0, PAGE_W, PAGE_H, "", "FAST");
  }

  // 6) PDF موڈ آف — UI نارمل پر واپس
  document.body.classList.remove("pdf-export");

  // 7) جو آپ کے فلو میں بہتر ہو:
  //    a) اگر آپ بعد میں WhatsApp share وغیرہ کرتے ہیں تو object واپس کریں:
  const filename = `IVS-Admission-${new Date().toISOString().slice(0,10)}.pdf`;
  return { pdf, filename };

  //    b) یا سیدھا save کر دیں (اگر یہی مطلوب ہو):
  // pdf.save(filename);
}

  // restore UI
  if (infoBar) infoBar.style.display = prevBarDisp || "";
  document.body.classList.remove("pdf-export");

  const filename = `IVS-Admission-${new Date().toISOString().slice(0,10)}.pdf`;
  return { pdf, filename };
}
async function exportPdfAndOpenWhatsAppApp() {
  // Master "I agree" لازمی
  const master = document.getElementById('declMaster');
  if (master && !master.checked) {
    alert('برائے مہربانی “I agree” چیک باکس کو ٹک کریں۔');
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
function initDeclarationMaster(){
  const master = document.getElementById('declMaster');   // ماسٹر "I agree" چیک باکس
  const btn     = document.getElementById('btnPdf');      // PDF بٹن

  if (!master || !btn) return;

  // بٹن کی حالت سیٹ کریں
  const setBtnState = () => {
    if (master.checked) {
      btn.removeAttribute('aria-disabled');
    } else {
      btn.setAttribute('aria-disabled', 'true');
    }
  };

  // صفحہ کھلتے ہی حالت سیٹ
  setBtnState();

  // چیک باکس بدلے تو حالت اپڈیٹ
  master.addEventListener('change', setBtnState);

  // اگر agree نہیں ہوا اور بٹن دبایا تو پیغام دکھائیں
  btn.addEventListener('click', (e) => {
    if (!master.checked) {
      e.preventDefault();
      alert('Please tick the “I agree” checkbox to proceed.');
      try { master.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch {}
    }
  });
}






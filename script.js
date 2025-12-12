/* public/script.js
   IVS Admission Form — signature pad + PDF export + print + WhatsApp (app) share
*/
document.addEventListener("DOMContentLoaded", () => {
  initSignaturePad();
  wireButtons();
  initSingleGradeSelect();   // <<< make Grade checkboxes single-select
  autoFillRegDate();         // <<< NEW: auto-fill DATE OF REGISTRATION with today's date
  initDeclarationMaster();   // <<< NEW
  initGuardianWhatsAppDropdown(); // <<< NEW: country dropdown for Guardian WhatsApp
});

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

  const start = (e) => {
    isDrawing = true;
    lastPoint = getPos(e);
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
    const name =
      block.querySelector(".studentName")?.value ||
      document.getElementById("studentName")?.value ||
      "";
    const dob =
      block.querySelector(".dob")?.value ||
      document.getElementById("dob")?.value ||
      "";
    const grade =
      block.querySelector("select")?.value ||
      document.getElementById("gradeSelect")?.value ||
      "";
    const gender =
      block.querySelector('input[type="radio"]:checked')?.value ||
      document.querySelector('input[name="gender"]:checked')?.value ||
      "";

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
    Array.from(document.images).map((img) => {
      if (img.complete) return Promise.resolve();
      return new Promise((res) => {
        img.onload = img.onerror = res;
      });
    })
  );

  const pdf = new jsPDF("p", "pt", "a4");
  const pageW = pdf.internal.pageSize.getWidth(); // ~595pt
  const pageH = pdf.internal.pageSize.getHeight(); // ~842pt
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
      scrollX: 0, // کوئی اسکرول آفسیٹ نہیں
      scrollY: 0,
    });

    const img = canvas.toDataURL("image/jpeg", 0.95);
    if (i > 0) pdf.addPage();
    pdf.addImage(img, "JPEG", 0, 0, 595, 842);
  }

  // restore UI
  if (infoBar) infoBar.style.display = prevBarDisp || "";
  document.body.classList.remove("pdf-export");

  const filename = `IVS-Admission-${new Date()
    .toISOString()
    .slice(0, 10)}.pdf`;
  return { pdf, filename };
}

/* ---------- 4) Send Data + Export PDF + WhatsApp ---------- */
async function exportPdfAndOpenWhatsAppApp() {
  // Master "I agree" لازمی
  const master = document.getElementById("declMaster");
  if (master && !master.checked) {
    alert('Please tick the "I agree" checkbox to proceed.');
    return;
  }

  // (اختیاری) اگر آپ 1–10 والے hidden/رکھے ہوئے چیک باکس بھی ساتھ ٹک کرانا چاہتے ہیں:
  document
    .querySelectorAll(".declaration-list input.decl")
    .forEach((cb) => (cb.checked = true));

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

  const student =
    document.getElementById("studentName")?.value?.trim() || "student";
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
        text: caption,
      });

      // optional: also save a local copy for the user
      try {
        pdf.save(filename);
      } catch {}
      return; // stop here — user is now in WhatsApp app with the file attached
    }
  } catch (err) {
    console.warn("Native share failed, will fallback:", err);
  }

  // ❗ Fallbacks (no WhatsApp Web):
  // 1) Save the PDF locally so the user can attach inside WhatsApp app
  try {
    pdf.save(filename);
  } catch {}

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

  // بٹن کی حالت سیٹ کریں (blur / active)
  const setBtnState = () => {
    if (master.checked) {
      btn.removeAttribute("aria-disabled");
      btn.style.pointerEvents = "auto"; // ✅ clickable
      btn.style.opacity = "1"; // ✅ visible active
    } else {
      btn.setAttribute("aria-disabled", "true");
      btn.style.pointerEvents = "none"; // ✅ completely unclickable
      btn.style.opacity = "0.5"; // ✅ visually disabled
    }
  };

  // صفحہ لوڈ ہوتے ہی بٹن کی حالت سیٹ کریں
  setBtnState();

  // جب checkbox بدلے تو بٹن کی حالت اپڈیٹ کریں
  master.addEventListener("change", setBtnState);

  // اگر tick نہیں ہوا تو alert دکھا کر روک دو
  btn.addEventListener("click", (e) => {
    if (!master.checked) {
      e.preventDefault();
      e.stopImmediatePropagation(); // ✅ event کو مکمل طور پر روک دے
      alert('Please tick the “I agree” checkbox to proceed.');
      try {
        master.scrollIntoView({ behavior: "smooth", block: "center" });
      } catch {}
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
      newInputs.forEach((inp) =>
        inp.addEventListener("input", () => {
          if (typeof generateSummaryHTML === "function") generateSummaryHTML();
        })
      );
      const radios = clone.querySelectorAll('input[type="radio"]');
      radios.forEach((r) =>
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
    genderRadios: document.querySelectorAll('input[name="gender"]'),
  };

  window.generateSummaryHTML = function () {
    let html = "";
    let index = 1;

    // 🧒 Main Student Info
    const mainGender =
      Array.from(mainFields.genderRadios).find((r) => r.checked)?.value || "";
    if (
      mainFields.name.value ||
      mainFields.dob.value ||
      mainFields.grade.value
    ) {
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
      const gender =
        block.querySelector('input[type="radio"]:checked')?.value || "";

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
          mainFields.genderRadios.forEach((r) => (r.checked = false));
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
  [mainFields.name, mainFields.dob, mainFields.grade].forEach((el) =>
    el.addEventListener("input", generateSummaryHTML)
  );
  mainFields.genderRadios.forEach((r) =>
    r.addEventListener("change", generateSummaryHTML)
  );

  // 🎯 When Add Another Child button clicked
  if (addChildBtn) {
    addChildBtn.addEventListener("click", () => {
      setTimeout(() => {
        const newBlock = document.querySelectorAll(
          ".child-block:last-child input, .child-block:last-child select"
        );
        newBlock.forEach((inp) =>
          inp.addEventListener("input", generateSummaryHTML)
        );
        const radios = document.querySelectorAll(
          ".child-block:last-child input[type='radio']"
        );
        radios.forEach((r) =>
          r.addEventListener("change", generateSummaryHTML)
        );
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
    am: "Aamir",
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

/* ---------- Guardian WhatsApp Country Dropdown (Search + Auto Code + Lock Code) ---------- */
function initGuardianWhatsAppDropdown() {
  const input = document.getElementById("gWhats");
  if (!input) return;

  // Basic tel settings
  input.setAttribute("inputmode", "tel");
  input.setAttribute("autocomplete", "tel");

  // ❌ Jab tak country select na ho, user number type nahi kar sakta
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
    { name: "Zimbabwe", code: "ZW", dial: "+263" }
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

    const sanitizedLocal = local ? " " + local : "";
    input.value = country.dial + sanitizedLocal;
    input.dataset.currentCode = country.dial.replace(/\D/g, "");
    input.dataset.currentDial = country.dial;

    // ✅ Sirf jab user dropdown se country select kare tab number typing allow ho
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

  // 👉 Input guard: code hataoge to sab lock ho jayega
  input.addEventListener("input", () => {
    const dial = input.dataset.currentDial || "";

    // Agar pehle se country fix hi nahi hai
    if (!dial || !countrySelected) {
      input.value = "";
      input.readOnly = true;
      countrySelected = false;
      input.dataset.currentCode = "";
      input.dataset.currentDial = "";
      return;
    }

    // Agar user ne sab clear kar diya
    if (!input.value.trim()) {
      input.value = "";
      input.readOnly = true;
      countrySelected = false;
      input.dataset.currentCode = "";
      input.dataset.currentDial = "";
      return;
    }

    // Agar value ab dial se start hi nahi ho rahi => code remove kiya
    if (!input.value.startsWith(dial)) {
      input.value = "";
      input.readOnly = true;
      countrySelected = false;
      input.dataset.currentCode = "";
      input.dataset.currentDial = "";
    }
  });

  // ❌ No default Pakistan now — user must select a country first
}

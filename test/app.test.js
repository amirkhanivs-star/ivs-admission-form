process.env.NODE_ENV = "test";
import assert from "assert/strict";
import fs from "fs";
import path from "path";
import http from "http";
import { fileURLToPath, pathToFileURL } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

console.log("=== Running IVS Admission Form Verification & Regression Tests ===\n");

// Named pipe HTTP client for fast, reliable, socketless server testing
function testRequest(app, method, urlPath, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const pipe = "\\\\.\\pipe\\test-ivs-" + Date.now() + "-" + Math.random().toString(36).slice(2);
    const server = http.createServer(app);
    server.listen(pipe, () => {
      const opts = {
        socketPath: pipe,
        path: urlPath,
        method: method.toUpperCase(),
        headers: { ...headers }
      };

      if (body && typeof body === "object") {
        body = JSON.stringify(body);
        opts.headers["content-type"] = "application/json";
        opts.headers["content-length"] = Buffer.byteLength(body);
      }

      const req = http.request(opts, (res) => {
        let data = "";
        res.on("data", (chunk) => { data += chunk; });
        res.on("end", () => {
          server.close();
          let json = null;
          try {
            json = JSON.parse(data);
          } catch {}
          resolve({ status: res.statusCode, headers: res.headers, body: data, json });
        });
      });

      req.on("error", (err) => {
        server.close();
        reject(err);
      });

      if (body) {
        req.write(body);
      }
      req.end();
    });
  });
}

let passed = 0;
let total = 0;

async function runTest(name, fn) {
  total++;
  process.stdout.write(`Test ${total}: ${name} ... `);
  try {
    await fn();
    console.log("PASSED");
    passed++;
  } catch (err) {
    console.log("FAILED");
    console.error(err);
    process.exitCode = 1;
  }
}

// -------------------------------------------------------------
// 1. Static Assets & Deployment Files
// -------------------------------------------------------------
await runTest("Essential static assets exist in project root", () => {
  assert.ok(fs.existsSync(path.join(rootDir, "index.html")), "index.html missing");
  assert.ok(fs.existsSync(path.join(rootDir, "script.js")), "script.js missing");
  assert.ok(fs.existsSync(path.join(rootDir, "styles.css")), "styles.css missing");
  assert.ok(fs.existsSync(path.join(rootDir, "img", "ivs-banner.png")), "ivs-banner.png missing");
});

await runTest("Vercel configuration vercel.json is valid and contains API rewrites", () => {
  const vPath = path.join(rootDir, "vercel.json");
  assert.ok(fs.existsSync(vPath), "vercel.json missing");
  const config = JSON.parse(fs.readFileSync(vPath, "utf8"));
  assert.equal(config.version, 2, "Expected vercel.json version 2");
  assert.ok(Array.isArray(config.rewrites), "rewrites must be an array");
  const apiRewrite = config.rewrites.find(r => r.source === "/api/(.*)");
  assert.ok(apiRewrite, "Must rewrite /api/(.*)");
  assert.equal(apiRewrite.destination, "/api/index.js", "Must point to /api/index.js");
});

await runTest("Vercel serverless function entrypoint api/index.js exists and exports Express app", async () => {
  const apiEntryPath = path.join(rootDir, "api", "index.js");
  assert.ok(fs.existsSync(apiEntryPath), "api/index.js missing");
  const mod = await import(pathToFileURL(apiEntryPath).href);
  assert.ok(mod.default, "api/index.js must have a default export");
  assert.equal(typeof mod.default, "function", "Default export must be an Express request handler function");
});

await runTest("server.js exports default app and named helpers", async () => {
  const serverPath = path.join(rootDir, "server.js");
  const mod = await import(pathToFileURL(serverPath).href);
  assert.ok(mod.default, "server.js must default-export Express app");
  assert.ok(mod.app, "server.js must export app");
  assert.ok(mod.checkDuplicateAdmission, "server.js must export checkDuplicateAdmission");
  assert.ok(mod.readLocalAdmissions, "server.js must export readLocalAdmissions");
  assert.ok(mod.writeLocalAdmissions, "server.js must export writeLocalAdmissions");
});

// -------------------------------------------------------------
// 2. HTTP Route Verification (Static & Root Serving)
// -------------------------------------------------------------
const { default: app } = await import(pathToFileURL(path.join(rootDir, "server.js")).href);

await runTest("GET / returns index.html admission form with 200 OK", async () => {
  const res = await testRequest(app, "GET", "/");
  assert.equal(res.status, 200);
  assert.ok(res.body.includes("IVS Admission Registration Form"), "Root must include form title");
  assert.ok(res.body.includes("Student Info"), "Root must include Student Info section");
});

await runTest("GET /api/status returns service status and reviewMode", async () => {
  const res = await testRequest(app, "GET", "/api/status");
  assert.equal(res.status, 200);
  assert.ok(res.json, "Expected JSON response");
  assert.equal(res.json.ok, true);
  assert.equal(res.json.service, "ivs-admission-form");
  assert.equal(typeof res.json.reviewMode, "boolean");
});

// -------------------------------------------------------------
// 3. Advisor Review Mode & Filesystem Compatibility
// -------------------------------------------------------------
await runTest("GET /api/forms/check handles duplicate check gracefully in review mode", async () => {
  process.env.ADMISSION_REVIEW_MODE = "true";
  const res = await testRequest(app, "GET", "/api/forms/check?name=TestStudent&dob=2010-01-01&guardian=%2B923001234567");
  assert.equal(res.status, 200);
  assert.equal(res.json.exists, false);
});

await runTest("POST /api/admissions/submit enforces validation before review mode", async () => {
  process.env.ADMISSION_REVIEW_MODE = "true";
  // Missing required student name and whatsapp
  const invalidPayload = {
    children: [{}],
    declaration_acknowledged: true,
    signature_data_url: "data:image/png;base64," + "A".repeat(60)
  };
  const res = await testRequest(app, "POST", "/api/admissions/submit", {}, invalidPayload);
  assert.equal(res.status, 400);
  assert.equal(res.json.ok, false);
  assert.equal(res.json.error, "missing_required_fields");
});

await runTest("POST /api/admissions/submit enforces declaration acknowledgment", async () => {
  process.env.ADMISSION_REVIEW_MODE = "true";
  const noDeclPayload = {
    children: [{ student_name: "Ahmed Khan", dob: "2010-05-15" }],
    guardian_whatsapp: "+923001112233",
    declaration_acknowledged: false,
    signature_data_url: "data:image/png;base64," + "A".repeat(60)
  };
  const res = await testRequest(app, "POST", "/api/admissions/submit", {}, noDeclPayload);
  assert.equal(res.status, 400);
  assert.equal(res.json.ok, false);
  assert.equal(res.json.error, "declaration_not_accepted");
});

await runTest("POST /api/admissions/submit enforces valid digital signature", async () => {
  process.env.ADMISSION_REVIEW_MODE = "true";
  const noSigPayload = {
    children: [{ student_name: "Ahmed Khan", dob: "2010-05-15" }],
    guardian_whatsapp: "+923001112233",
    declaration_acknowledged: true,
    signature_data_url: ""
  };
  const res = await testRequest(app, "POST", "/api/admissions/submit", {}, noSigPayload);
  assert.equal(res.status, 400);
  assert.equal(res.json.ok, false);
  assert.equal(res.json.error, "signature_required");
});

await runTest("POST /api/admissions/submit in review mode succeeds without saving to disk or dashboard", async () => {
  process.env.ADMISSION_REVIEW_MODE = "true";

  // Check admissions.json count before test
  const admissionsPath = path.join(rootDir, "data", "admissions.json");
  let countBefore = 0;
  if (fs.existsSync(admissionsPath)) {
    try {
      countBefore = JSON.parse(fs.readFileSync(admissionsPath, "utf8")).length;
    } catch {}
  }

  const validPayload = {
    children: [{
      student_name: "Review Test Student",
      dob: "2011-03-20",
      gender: "Male",
      grade: "Grade 9"
    }],
    father_name: "Tariq Mahmood",
    guardian_whatsapp: "+923009998877",
    declaration_acknowledged: true,
    signature_data_url: "data:image/png;base64," + "A".repeat(100)
  };

  const res = await testRequest(app, "POST", "/api/admissions/submit", {}, validPayload);
  assert.equal(res.status, 200);
  assert.equal(res.json.ok, true);
  assert.equal(res.json.success, true);
  assert.equal(res.json.reviewMode, true, "reviewMode flag must be true");
  assert.equal(res.json.localSaved, false, "localSaved must be false in review mode");
  assert.equal(res.json.dashboardSaved, false, "dashboardSaved must be false in review mode");
  assert.ok(res.json.id && res.json.id.startsWith("REV-"), "Review ID must start with REV-");
  assert.ok(res.json.message.includes("Submissions are disabled in this review deployment"), "Message must explain submissions are disabled");
  assert.ok(!res.json.message.includes("synced with central dashboard"), "Never claim fake dashboard sync");

  // Verify file was NOT modified
  let countAfter = 0;
  if (fs.existsSync(admissionsPath)) {
    try {
      countAfter = JSON.parse(fs.readFileSync(admissionsPath, "utf8")).length;
    } catch {}
  }
  assert.equal(countBefore, countAfter, "No record should be added to admissions.json in review mode");
});

await runTest("Production mode (ADMISSION_REVIEW_MODE=false) persists locally and checks duplicates", async () => {
  process.env.ADMISSION_REVIEW_MODE = "false";
  const uniqueName = "ProdTestChild_" + Date.now();
  const uniquePhone = "+92300" + Math.floor(1000000 + Math.random() * 9000000);

  const payload = {
    submission_id: "SUB-PROD-" + Date.now(),
    children: [{
      student_name: uniqueName,
      dob: "2012-04-10",
      gender: "Female",
      grade: "Grade 8"
    }],
    father_name: "Farhan Ali",
    guardian_whatsapp: uniquePhone,
    declaration_acknowledged: true,
    signature_data_url: "data:image/png;base64," + "B".repeat(100)
  };

  const res = await testRequest(app, "POST", "/api/admissions/submit", {}, payload);
  assert.equal(res.status, 200);
  assert.equal(res.json.ok, true);
  assert.equal(res.json.localSaved, true, "Must save locally in production mode");
  assert.ok(res.json.id.startsWith("ADM-"), "Production ID must start with ADM-");

  // Duplicate check endpoint should now detect this record
  const checkRes = await testRequest(app, "GET", `/api/forms/check?name=${encodeURIComponent(uniqueName)}&dob=2012-04-10&guardian=${encodeURIComponent(uniquePhone)}`);
  assert.equal(checkRes.status, 200);
  assert.equal(checkRes.json.exists, true, "Duplicate record should be detected in production mode");

  // Second submission should be rejected as duplicate (409)
  const dupRes = await testRequest(app, "POST", "/api/admissions/submit", {}, {
    ...payload,
    submission_id: "SUB-PROD-NEW-" + Date.now()
  });
  assert.equal(dupRes.status, 409, "Duplicate submission must return 409");
  assert.equal(dupRes.json.isDuplicate, true);

  // Restore review mode
  process.env.ADMISSION_REVIEW_MODE = "true";
});

// -------------------------------------------------------------
// 4. Academic Features & Client Interface Verification
// -------------------------------------------------------------
const scriptContent = fs.readFileSync(path.join(rootDir, "script.js"), "utf8");
const htmlContent = fs.readFileSync(path.join(rootDir, "index.html"), "utf8");
const cssContent = fs.readFileSync(path.join(rootDir, "styles.css"), "utf8");

await runTest("IGCSE Grade 8, 9, and 10 selection configuration exists in script.js", () => {
  assert.ok(scriptContent.includes("IGCSE_CONFIG"), "IGCSE_CONFIG must exist");
  assert.ok(scriptContent.includes("Grade 8 (IGCSE / Pre-O-Level)"), "Grade 8 IGCSE must be configured");
  assert.ok(scriptContent.includes("Grade 9 (IGCSE / O-Level)"), "Grade 9 IGCSE must be configured");
  assert.ok(scriptContent.includes("Grade 10 (IGCSE / O-Level)"), "Grade 10 IGCSE must be configured");
});

await runTest("Academic streams (Pure Sciences, IT & Engineering, Commerce, Humanities) exist", () => {
  assert.ok(scriptContent.includes("pure_sciences") && scriptContent.includes("Pure Sciences"), "Pure Sciences stream must exist");
  assert.ok(scriptContent.includes("it_engineering") && scriptContent.includes("IT & Engineering"), "IT & Engineering stream must exist");
  assert.ok(scriptContent.includes("commerce") && scriptContent.includes("Commerce"), "Commerce stream must exist");
  assert.ok(scriptContent.includes("humanities") && scriptContent.includes("Humanities"), "Humanities stream must exist");
});

await runTest("Compulsory English and Mathematics are configured with mandatory flags", () => {
  assert.ok(scriptContent.includes("mathematics") && scriptContent.includes("Mathematics"), "Mathematics must be configured");
  assert.ok(scriptContent.includes("english") && scriptContent.includes("English as a First Language"), "English must be configured");
  assert.ok(scriptContent.includes("isMandatory: true"), "isMandatory: true must be configured for compulsory subjects");
});

await runTest("Optional Computer Science subject is supported", () => {
  assert.ok(scriptContent.includes("Computer Science"), "Computer Science must be present in subjects configuration");
  assert.ok(scriptContent.includes("optionalSubjects"), "optionalSubjects configuration must exist");
});

await runTest("Pakistani equivalence subjects (Islamiyat, Pak Studies, Urdu) exist", () => {
  assert.ok(scriptContent.includes("Islamiyat"), "Islamiyat must exist");
  assert.ok(scriptContent.includes("Pakistan Studies"), "Pakistan Studies must exist");
  assert.ok(scriptContent.includes("Urdu"), "Urdu must exist");
  assert.ok(scriptContent.includes("pakistanPathway"), "pakistanPathway must exist");
});

await runTest("Grade 10 examination conditions and review status logic exist", () => {
  assert.ok(scriptContent.includes("grade10Rules"), "grade10Rules must exist");
  assert.ok(scriptContent.includes("Cambridge") && scriptContent.includes("Pearson Edexcel"), "Exam boards must be configured");
  assert.ok(scriptContent.includes("Academic Review Required"), "Academic Review Required status must be evaluated");
});

await runTest("Multiple children registration support exists", () => {
  assert.ok(htmlContent.includes("child-block") || htmlContent.includes("additionalChildrenContainer"), "Multiple children markup must exist");
  assert.ok(scriptContent.includes("formatChildAdmissionRecord"), "Child admission record formatting must exist");
  assert.ok(scriptContent.includes("validateAllActiveChildren"), "Multi-child validation must exist");
});

await runTest("Mobile grade picker modal and bottom sheet markup/styles exist", () => {
  assert.ok(htmlContent.includes("mobileGradePickerModal"), "mobileGradePickerModal must exist in index.html");
  assert.ok(cssContent.includes(".mobile-grade-modal"), "Mobile grade modal styles must exist");
  assert.ok(scriptContent.includes("initMobileGradePicker"), "initMobileGradePicker must exist in script.js");
});

await runTest("Parent declaration and digital signature pad exist", () => {
  assert.ok(htmlContent.includes("declMaster"), "declMaster checkbox must exist");
  assert.ok(htmlContent.includes('id="sig"'), "Signature canvas must exist");
  assert.ok(scriptContent.includes("initSignaturePad"), "initSignaturePad must exist");
  assert.ok(scriptContent.includes("initDeclarationMaster"), "initDeclarationMaster must exist");
});

await runTest("Client-side PDF generation support exists (html2canvas & jsPDF)", () => {
  assert.ok(htmlContent.includes("html2canvas"), "html2canvas must be loaded");
  assert.ok(htmlContent.includes("jspdf"), "jspdf must be loaded");
  assert.ok(scriptContent.includes("buildPdfFromPages"), "buildPdfFromPages must exist");
  assert.ok(scriptContent.includes("exportPdfAndOpenWhatsAppApp"), "exportPdfAndOpenWhatsAppApp must exist");
});

await runTest("Advisor Review Banner and styles are properly implemented", () => {
  assert.ok(cssContent.includes(".review-mode-banner"), ".review-mode-banner style must exist in styles.css");
  assert.ok(scriptContent.includes("checkReviewModeStatus"), "checkReviewModeStatus must exist in script.js");
  assert.ok(scriptContent.includes("showReviewModeBanner"), "showReviewModeBanner must exist in script.js");
});

console.log(`\n=============================================================`);
console.log(`Test Results: ${passed} / ${total} tests passed.`);
console.log(`=============================================================\n`);

if (passed !== total) {
  process.exit(1);
}

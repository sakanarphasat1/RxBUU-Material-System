// ==========================================================
// 💥 ส่วนที่ 1: การตั้งค่าระบบ (Configuration)
// ==========================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
    getAuth,
    signInWithPopup,
    signInWithRedirect,
    getRedirectResult,
    GoogleAuthProvider,
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// ⚙️ 1.1 ค่า firebaseConfig
const firebaseConfig = {
    apiKey: "AIzaSyC-IKwMD7-vkuG0moT24EAsSyxaV8Xty6c",
    authDomain: "pharmacy-material-system.firebaseapp.com",
    projectId: "pharmacy-material-system",
    storageBucket: "pharmacy-material-system.firebasestorage.app",
    messagingSenderId: "605650439921",
    appId: "1:605650439921:web:a351896936ba83d1e2e350",
    measurementId: "G-EE28Y1L35G"
};

// 🔗 1.2 Web App URL จาก Google Apps Script (ใช้ตัวแปรนี้จุดเดียวทั้งไฟล์)
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwZM3AcOzuf4mHC8oeIhpBj8MDUvvf-PChhXuAUOMagiBoYL_rmu-CgD6wID10NZwoi/exec";

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

// 🟢 บังคับให้ Google แสดงหน้าเลือกบัญชีใหม่เสมอทุกครั้งที่มีการกดล็อกอิน
provider.setCustomParameters({
    prompt: 'select_account'
});

// 🏷️ 1.3 เลขรุ่นของไฟล์นี้ — ใช้ยืนยันว่าเบราว์เซอร์โหลดไฟล์ใหม่จริงหรือยังโหลดไฟล์เก่าจาก cache
//     ⚠️ ทุกครั้งที่แก้ไฟล์นี้ ต้องแก้ค่านี้ + แก้ ?v= ใน index.html ให้ตรงกัน ไม่งั้นมือถือจะยังใช้ไฟล์เก่า
const APP_BUILD = "2026-10-12-r4";

// 🏷️ แสดงเลขรุ่นไฟล์มุมล่างของการ์ดเข้าสู่ระบบ (ถ้ามองไม่เห็น = เบราว์เซอร์ยังใช้ไฟล์เก่าอยู่)
(function showBuildStamp() {
    try {
        const el = document.getElementById('buildStamp');
        if (el) el.textContent = "เวอร์ชันไฟล์: " + APP_BUILD;
    } catch (e) { }
})();

// 🧪 ร่องรอยการล็อกอินครั้งล่าสุด — ใช้ในหน้าต่าง "ข้อมูลวินิจฉัย"
//    เก็บทุกกรณีรวมถึงกรณีที่ผู้ใช้ปิดหน้าต่างล็อกอินเอง (เดิมเงียบ ทำให้ตรวจสาเหตุไม่ได้)
let lastLoginTrace = "(ยังไม่ได้ลองล็อกอินในหน้านี้)";
function setLoginTrace(text, error) {
    const code = (error && error.code) ? String(error.code) : "";
    lastLoginTrace = text + (code ? " | code=" + code : "");
}

// 📌 ปุ่ม "ข้อมูลวินิจฉัย" — ให้ผู้ใช้กดดูแล้วส่งภาพหน้าจอมาได้เลย ไม่ต้องเปิด console
window.showDiagnostics = async function () {
    const box = document.getElementById('diagBox');
    if (!box) return;
    if (box.style.display === 'block') { box.style.display = 'none'; return; }
    box.style.display = 'block';
    box.textContent = "กำลังตรวจสอบ...";
    let proxyOk = false;
    try { proxyOk = await canUseRedirectFallback(); } catch (e) { proxyOk = false; }
    box.textContent = [
        "เวอร์ชันไฟล์: " + APP_BUILD,
        buildDiagnostics(),
        "ล็อกอินครั้งล่าสุด: " + lastLoginTrace,
        "ทางเชื่อม /__/auth บนโดเมนนี้: " + (proxyOk ? "มี (ใช้วิธี Redirect ได้)" : "ไม่มี (ใช้วิธี Redirect ไม่ได้)"),
        "เวลา: " + new Date().toLocaleString("th-TH"),
        "เบราว์เซอร์: " + navigator.userAgent
    ].join("\n");
};

// ตัวแปรส่วนกลาง (Global Variables)
let rowCount = 1;
let globalMaterialList = [];
let currentUserFullName = "";

// 🔒 ตัวแปรกันบันทึกซ้ำ (retry หลังเน็ตหลุดต้องไม่ตัดสต็อกสองรอบ)
let pendingSaveFingerprint = "";
let pendingSaveRequestId = "";

// 📌 สร้างรหัสคำขอเฉพาะของการบันทึก 1 ครั้ง (เซิร์ฟเวอร์ใช้รหัสนี้กันบันทึกซ้ำ)
function newRequestId() {
    try {
        if (window.crypto && typeof window.crypto.randomUUID === "function") {
            return window.crypto.randomUUID();
        }
    } catch (e) { }
    return "req-" + Date.now() + "-" + Math.random().toString(36).slice(2, 10);
}

// ==========================================================
// 💥 ส่วนที่ 2: ระบบยืนยันตัวตน (Authentication) & โหลดหน้าเว็บ
// ==========================================================

// 📌 ฟังก์ชันตรวจสอบอุปกรณ์ (iOS หรือ Safari)
function isIOSorSafari() {
    const ua = navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
    return isIOS || isSafari;
}

// 📌 ตรวจอุปกรณ์พกพาทุกชนิด (iPhone, iPad, Android) — ใช้ในข้อความวินิจฉัย
function isMobileDevice() {
    const ua = navigator.userAgent;
    const hitUA = /Android|iPad|iPhone|iPod|Mobile|Silk|Kindle|BlackBerry|Opera Mini/i.test(ua);
    const hitPointer = (typeof window.matchMedia === "function") && window.matchMedia("(pointer: coarse)").matches;
    return hitUA || hitPointer;
}

// ⚠️ แก้ 2026-10: เดิมมือถือ/Safari ถูกส่งไปใช้ signInWithRedirect() เสมอ ซึ่ง "ใช้ไม่ได้แล้ว"
//    สาเหตุ: Safari 16.1+ / Chrome 115+ / Firefox 109+ บล็อก third-party storage ที่ Firebase
//            ต้องใช้เชื่อม iframe ของ auth handler (คนละโดเมนกับเว็บเรา)
//    อาการ: กดล็อกอิน → ไปหน้า Google → กลับมา → onAuthStateChanged ได้ null → เด้งกลับหน้าล็อกอิน
//    หลักฐาน: https://pharm.buu.ac.th/__/auth/iframe = 404 แปลว่าไม่ได้ proxy /__/auth ไว้บนโดเมนเรา
//    เอกสารอ้างอิง: Firebase — "Best practices for using signInWithRedirect on browsers that
//                   block third-party storage access" (แนะนำให้ใช้ Popup ถ้าไม่ได้ proxy)
//    วิธีใหม่: ลอง Popup ก่อนเสมอทุกอุปกรณ์ และถอยไปใช้ Redirect เฉพาะตอน Popup ถูกบล็อกจริง ๆ

// 📌 ตรวจว่า "ทางถอย" ไปใช้ Redirect ใช้ได้จริงหรือไม่
//    การใช้ Redirect ต้องมี /__/auth บนโดเมนของเรา (reverse proxy ไป firebaseapp.com)
//    ถ้าไม่ได้ตั้งไว้ (เช่นที่ pharm.buu.ac.th) Redirect จะพาไป Google แล้วเด้งกลับมาแบบเดิม
//    → ตรวจก่อนว่าโดเมนเรามี /__/auth จริง ถ้าไม่มีจะได้ไม่พาผู้ใช้ไปวนซ้ำ
let redirectFallbackCache = null;
async function canUseRedirectFallback() {
    if (redirectFallbackCache !== null) return redirectFallbackCache;
    try {
        const controller = (typeof AbortController !== "undefined") ? new AbortController() : null;
        const timer = controller ? setTimeout(() => controller.abort(), 4000) : null;
        const res = await fetch(window.location.origin + "/__/auth/iframe", {
            method: "GET",
            cache: "no-store",
            signal: controller ? controller.signal : undefined
        });
        if (timer) clearTimeout(timer);
        redirectFallbackCache = !!res.ok;
    } catch (e) {
        redirectFallbackCache = false;
    }
    return redirectFallbackCache;
}

// 📌 ข้อความเมื่อมือถือเปิดป๊อปอัปไม่ได้ และยังไม่มี /__/auth ให้ถอยไปใช้
const MOBILE_POPUP_BLOCKED_MESSAGE = [
    "⛔ เบราว์เซอร์นี้ไม่ยอมเปิดหน้าต่างล็อกอินของ Google",
    "",
    "สาเหตุที่พบบ่อย",
    "1) เปิดลิงก์จากในแอป LINE / Facebook / Messenger (เบราว์เซอร์ในแอปเปิดป๊อปอัปไม่ได้)",
    "2) ตั้งค่า Safari ปิดกั้นป๊อปอัป",
    "",
    "วิธีแก้ที่ได้ผลที่สุด",
    "1) กดไอคอน ⋯ มุมขวาบน แล้วเลือก \"เปิดใน Safari\" (หรือ \"เปิดในเบราว์เซอร์\")",
    "2) หรือคัดลอกลิงก์ไปเปิดในแอป Safari / Chrome โดยตรง",
    "3) ตั้งค่า → Safari → ปิด \"บล็อกป๊อปอัป\" แล้วลองใหม่",
    "",
    "ถ้ายังไม่ผ่าน กรุณาใช้เครื่องคอมพิวเตอร์เข้าใช้งานแทน"
].join("\n");

// 📌 ตรวจว่าเบราว์เซอร์ยอมให้เว็บไซต์เก็บข้อมูล
//    ถ้า iPhone เปิด "บล็อกคุกกี้ทั้งหมด" หรืออยู่ในโหมดไม่ระบุตัวตน
//    Firebase จะจำสถานะล็อกอินไม่ได้ → ล็อกอินเสร็จแล้วเด้งกลับหน้าล็อกอิน
function isLocalStorageUsable() {
    try {
        const probe = "__rx_probe__";
        window.localStorage.setItem(probe, "1");
        window.localStorage.removeItem(probe);
        return true;
    } catch (e) {
        return false;
    }
}

// 📌 ข้อความแนะนำเมื่อ Safari บล็อกการเก็บข้อมูล
const STORAGE_BLOCKED_MESSAGE = [
    "⛔ Safari ตั้งค่าไม่ให้เว็บไซต์เก็บข้อมูล ทำให้ล็อกอินผ่าน Google แล้วถูกเด้งกลับหน้าล็อกอินทุกครั้ง",
    "",
    "วิธีแก้:",
    "1) การตั้งค่า → Safari → ความเป็นส่วนตัวและความปลอดภัย → ปิด บล็อกคุกกี้ทั้งหมด",
    "2) หรือปิดโหมดไม่ระบุตัวตน แล้วเปิดหน้านี้ใหม่อีกครั้ง"
].join("\n");

// 📌 หนี HTML ป้องกัน XSS ตอนแสดงข้อมูลที่มาจาก Google Sheets
function escapeHtml(value) {
    return String((value === null || value === undefined) ? "" : value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

// 📌 ข้อมูลวินิจฉัย ช่วยระบุสาเหตุเมื่อล็อกอินล้มเหลว
function buildDiagnostics(extra) {
    const parts = [
        "host=" + (window.location.host || "ไฟล์ท้องถิ่น"),
        "storage=" + (isLocalStorageUsable() ? "ปกติ" : "ถูกบล็อก"),
        "device=" + (isMobileDevice() ? "มือถือ" : "คอม"),
        "safari=" + (isIOSorSafari() ? "ใช่" : "ไม่"),
        "user=" + (auth.currentUser ? auth.currentUser.email : "ยังไม่มี"),
        "build=" + APP_BUILD
    ];
    if (extra) parts.push(extra);
    return parts.join(" | ");
}

// 📌 fetch ที่มี timeout ป้องกันค้างคาบนเน็ตมือถือ
async function fetchWithTimeout(url, options = {}, timeoutMs = 20000) {
    if (typeof AbortController === "undefined") {
        return fetch(url, options);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, Object.assign({}, options, { signal: controller.signal }));
    } finally {
        clearTimeout(timer);
    }
}

// 📌 helper อ่าน/เขียน localStorage แบบไม่ให้ exception ทำให้หลุดออกจากระบบ
function safeSetLocalStorage(key, value) {
    try { window.localStorage.setItem(key, value); } catch (e) { console.warn("localStorage.setItem ล้มเหลว:", e); }
}
function safeRemoveLocalStorage(key) {
    try { window.localStorage.removeItem(key); } catch (e) { }
}
function safeGetLocalStorage(key) {
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
}

// 📌 ฟังก์ชันแปลง Error Code ของ Firebase ให้อ่านเข้าใจง่าย
function getAuthErrorMessage(error) {
    if (!error) return "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ";
    const code = error.code || "";
    switch (code) {
        case "auth/unauthorized-domain":
            return "⛔ โดเมนนี้ยังไม่ได้เพิ่มใน Authorized Domains ของ Firebase Console";
        case "auth/popup-blocked":
            return "เบราว์เซอร์บล็อกหน้าต่าง Popup กำลังเปลี่ยนไปใช้โหมดเข้าสู่ระบบเต็มหน้าจอ...";
        case "auth/popup-closed-by-user":
            return "หน้าต่างเข้าสู่ระบบถูกปิดก่อนทำรายการเสร็จ";
        case "auth/cancelled-popup-request":
            return "มีการเปิดหน้าต่างเข้าสู่ระบบซ้ำซ้อน";
        case "auth/network-request-failed":
            return "การเชื่อมต่ออินเทอร์เน็ตล้มเหลว กรุณาตรวจสอบสัญญาณเน็ต";
        case "auth/redirect-pending":
            return "ระบบยังรอผลการล็อกอินอยู่ กรุณากดปุ่มล็อกอินอีกครั้ง";
        case "auth/redirect-cancelled-by-user":
            return "การเข้าสู่ระบบถูกยกเลิก";
        case "auth/invalid-credential":
        case "auth/invalid-argument":
            return "ไม่สามารถยืนยันตัวตนกับ Google ได้ กรุณากดล็อกอินใหม่อีกครั้ง";
        case "auth/user-disabled":
            return "บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ";
        case "auth/too-many-requests":
            return "พยายามเข้าสู่ระบบบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่";
        default:
            return error.message || "เกิดข้อผิดพลาดในการเข้าสู่ระบบ";
    }
}

// 📌 แสดงข้อผิดพลาดพร้อมข้อมูลวินิจฉัย
function displayAuthError(error) {
    const alertEl = document.getElementById('authAlert');
    const statusEl = document.getElementById('loginStatus');
    if (statusEl) statusEl.innerText = "";
    if (alertEl) {
        const code = (error && error.code) ? " [" + error.code + "]" : "";
        alertEl.style.display = 'block';
        alertEl.style.whiteSpace = 'pre-line';
        alertEl.innerText = "เกิดข้อผิดพลาด: " + getAuthErrorMessage(error) + code + "\n" + buildDiagnostics();
    }
}

function displayAuthMessage(message) {
    const alertEl = document.getElementById('authAlert');
    if (!alertEl) return;
    alertEl.style.display = 'block';
    alertEl.style.whiteSpace = 'pre-line';
    alertEl.innerText = message;
}

// ==========================================================
// 📱 ระบบ Redirect Login (มือถือ) + Flag ตรวจจับผลลัพธ์ที่หายไป
// ==========================================================

const PENDING_LOGIN_KEY = "rxPendingRedirectLogin";

function setPendingLoginFlag() {
    try { window.sessionStorage.setItem(PENDING_LOGIN_KEY, String(Date.now())); } catch (e) { }
}
function clearPendingLoginFlag() {
    try { window.sessionStorage.removeItem(PENDING_LOGIN_KEY); } catch (e) { }
}
function getPendingLoginFlag() {
    try { return Number(window.sessionStorage.getItem(PENDING_LOGIN_KEY) || 0); } catch (e) { return 0; }
}

// 📌 ฟังก์ชันล็อกอินด้วย Google รองรับทั้ง PC และโทรศัพท์มือถือ (iOS Safari / Android)
window.loginWithGoogle = async function () {
    const statusEl = document.getElementById('loginStatus');
    const alertEl = document.getElementById('authAlert');
    if (alertEl) {
        alertEl.style.display = 'none';
        alertEl.innerText = '';
    }
    if (statusEl) statusEl.innerHTML = `<span style="color:#0B8F70;">⏳ กำลังเชื่อมต่อ Google...</span>`;

    // ✅ ใช้ Popup ก่อนเสมอ ทุกอุปกรณ์ (ดูเหตุผลในคอมเมนต์ด้านบน)
    setPendingLoginFlag();
    setLoginTrace("ลอง Popup");
    try {
        await signInWithPopup(auth, provider);
        clearPendingLoginFlag();
        setLoginTrace("Popup สำเร็จ");
        if (statusEl) statusEl.innerText = "";
        return;
    } catch (error) {
        console.error("Popup login failed:", error);
        const code = (error && error.code) || "";

        // ผู้ใช้กดปิดหน้าต่างล็อกอินเอง → หยุดเงียบ ๆ ไม่ต้องเด้งไปไหน
        if (code === 'auth/popup-closed-by-user' || code === 'auth/user-cancelled') {
            clearPendingLoginFlag();
            setLoginTrace("ผู้ใช้ปิดหน้าต่างล็อกอินเอง", error);
            if (statusEl) statusEl.innerText = "";
            return;
        }

        // เบราว์เซอร์ไม่ให้เก็บข้อมูลเลย → แจ้งวิธีปิดการบล็อกคุกกี้
        if (code === 'auth/web-storage-unsupported') {
            clearPendingLoginFlag();
            setLoginTrace("เบราว์เซอร์กั้นการเก็บข้อมูล", error);
            displayAuthMessage(STORAGE_BLOCKED_MESSAGE + "\n" + buildDiagnostics());
            return;
        }

        // Popup ถูกบล็อกจริง ๆ → ถอยไปใช้ Redirect "เฉพาะเมื่อทางนั้นใช้ได้จริง"
        if (code === 'auth/popup-blocked' || code === 'auth/cancelled-popup-request' ||
            code === 'auth/operation-not-supported-in-this-environment') {

            // ⛔ ถ้าโดเมนนี้ยังไม่ได้ตั้ง /__/auth การถอยไป Redirect = พาไปวนกลับมาหน้าล็อกอินเดิม
            //    จึงบอกวิธีแก้ที่ทำได้จริงแทนการปล่อยให้ผู้ใช้วนซ้ำ
            if (!(await canUseRedirectFallback())) {
                clearPendingLoginFlag();
                setLoginTrace("ป๊อปอัปถูกบล็อก และไม่มี /__/auth ให้ถอย", error);
                if (statusEl) statusEl.innerText = "";
                displayAuthMessage(MOBILE_POPUP_BLOCKED_MESSAGE + "\n" + buildDiagnostics());
                return;
            }

            setLoginTrace("ป๊อปอัปถูกบล็อก → ถอยไป Redirect", error);
            if (statusEl) statusEl.innerHTML = `<span style="color:#C2761A;">⏳ หน้าต่างถูกบล็อก กำลังเปลี่ยนหน้าไป Google...</span>`;
            try {
                await signInWithRedirect(auth, provider);
                return;
            } catch (redirectError) {
                clearPendingLoginFlag();
                setLoginTrace("Redirect ล้มเหลว", redirectError);
                displayAuthError(redirectError);
                return;
            }
        }

        clearPendingLoginFlag();
        setLoginTrace("Popup ล้มเหลวแบบอื่น", error);
        displayAuthError(error);
    }
};

// 📌 ขอ ID token ของผู้ใช้ปัจจุบัน (ใช้ยืนยันตัวตนกับ Google Apps Script)
async function getAuthTokenOrNull() {
    try {
        // รอให้ Firebase คืนสถานะล็อกอินจากที่เก็บในเครื่องก่อน (สำคัญบน Safari/มือถือ
        // ที่ currentUser อาจยังว่างชั่วครูหลังล็อกอินด้วย redirect) — รอสูงสุด 3 วิ กันค้าง
        if (typeof auth.authStateReady === "function") {
            await Promise.race([
                auth.authStateReady(),
                new Promise(resolve => setTimeout(resolve, 3000))
            ]);
        }

        if (auth.currentUser) {
            return await auth.currentUser.getIdToken();
        }
    } catch (e) {
        console.warn("ขอ ID token ไม่สำเร็จ:", e);
    }
    return null;
}

// 📌 ฟังก์ชันช่วยตรวจสอบสิทธิ์ใน UserMaster (retry แบบ backoff + timeout)
async function verifyUserPermission(email, retryCount = 1, maxRetries = 5) {
    const statusEl = document.getElementById('loginStatus');

    if (statusEl && retryCount === 1) {
        statusEl.innerHTML = `<span style="color:#0B8F70;">⏳ กำลังตรวจสอบสิทธิ์ในระบบ...</span>`;
    }

    try {
        const response = await fetchWithTimeout(APPS_SCRIPT_URL, {
            method: 'POST',
            mode: 'cors',
            credentials: 'omit',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
                action: "checkUser",
                email: email,
                // 🔒 แนบ token เพื่อให้เซิร์ฟเวอร์ยืนยันว่าเป็นอีเมลของเจ้าของจริง
                //    (ถ้าไม่แนบ เซิร์ฟเวอร์จะไม่ส่งชื่อ-นามสกุลจากทะเบียนกลับมา)
                idToken: await getAuthTokenOrNull()
            })
        }, 25000);

        if (!response.ok) {
            throw new Error(`HTTP Error status: ${response.status}`);
        }

        const textData = await response.text();

        if (textData.trim().startsWith("<")) {
            throw new Error("Google Apps Script ตอบกลับเป็น HTML ชั่วคราว");
        }

        const result = JSON.parse(textData);
        return result;

    } catch (error) {
        if (retryCount < maxRetries) {
            // backoff: 0.5s, 1s, 2s, 4s — ให้ Apps Script มีเวลา warm up บนเน็ตมือถือ
            const delay = Math.min(8000, 500 * Math.pow(2, retryCount - 1));
            await new Promise(resolve => setTimeout(resolve, delay));
            return await verifyUserPermission(email, retryCount + 1, maxRetries);
        }
        console.warn(`⚠️ ตรวจสอบสิทธิ์ล้มเหลว:`, error.message);
        throw error;
    }
}

// 📌 โหลด Component ฟอร์มและพรีวิว (retry และคืนค่า true เฉพาะเมื่อโหลดได้จริงทั้งคู่)
function loadComponentsAttempt() {
    return Promise.all([
        loadComponent('formSection', 'form.html'),
        loadComponent('previewSection', 'preview.html')
    ]).then(results => results.every(Boolean));
}

let componentsLoadedPromise = loadComponentsAttempt();

async function ensureComponents() {
    const ok = await componentsLoadedPromise;
    if (ok) return true;
    componentsLoadedPromise = loadComponentsAttempt();
    return await componentsLoadedPromise;
}

// 📌 ฟังก์ชันช่วยโหลดคอมโพเนนต์ HTML
async function loadComponent(elementId, filePath, attempt = 1, maxAttempts = 3) {
    try {
        const response = await fetchWithTimeout(filePath, { cache: "no-cache" }, 15000);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const html = await response.text();
        const el = document.getElementById(elementId);
        if (!el) throw new Error("ไม่พบองค์ประกอบปลายทาง #" + elementId);
        if (!html || !html.trim()) throw new Error("ไฟล์ " + filePath + " ว่างเปล่า");
        el.innerHTML = html;
        return true;
    } catch (error) {
        console.error(`Error loading ${filePath} (ครั้งที่ ${attempt}):`, error);
        if (attempt < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 400 * attempt));
            return loadComponent(elementId, filePath, attempt + 1, maxAttempts);
        }
        return false;
    }
}

// ==========================================================
// 🔑 ขั้นตอนเข้าสู่ระบบ
// ==========================================================

// 📌 แสดงฟอร์มเมื่อทุกอย่างพร้อมแล้ว
function enterSystem(checkResult, user) {
    const loginSec = document.getElementById('loginSection');
    const formSec = document.getElementById('formSection');
    const statusEl = document.getElementById('loginStatus');
    const alertEl = document.getElementById('authAlert');

    safeSetLocalStorage("userEmail", user.email);
    currentUserFullName = (checkResult && checkResult.fullName) || user.displayName || user.email;

    if (loginSec) loginSec.classList.add('hidden');
    if (formSec) formSec.classList.remove('hidden');

    const requesterInput = document.getElementById('requesterName');
    if (requesterInput) requesterInput.value = currentUserFullName;

    initDefaultDate();

    // 🟢 มีแคชในเครื่องแล้ว → แสดงทันที 0 วิ / ยังไม่มี → บอกว่ากำลังโหลด
    if (globalMaterialList && globalMaterialList.length > 0) {
        renderAllDropdowns();
    } else {
        setDropdownsStatus("-- กำลังโหลดข้อมูลวัสดุ... --");
    }

    // 🔒 เซิร์ฟเวอร์ให้ดึงรายการวัสดุได้หลังยืนยันตัวตนแล้วเท่านั้น (มี "คงเหลือ" ติดมาด้วย)
    loadMaterials();

    if (statusEl) statusEl.innerText = "";
    if (alertEl) {
        alertEl.style.display = 'none';
        alertEl.innerText = '';
    }

    // หากเปิดเว็บมาแล้วรายการยังโหลดไม่เสร็จ ให้รอต่อแบบเงียบๆ
    setTimeout(() => {
        try {
            if (!globalMaterialList || globalMaterialList.length === 0) {
                materialsLoadingPromise.then(() => renderAllDropdowns()).catch(() => { });
            }
        } catch (e) { /* ยังไม่ถึงตอนสร้าง materialsLoadingPromise */ }
    }, 0);
}

// 📌 บัญชีไม่มีสิทธิ์ → เฉพาะกรณีนี้เท่านั้นที่ signOut
async function showDenied(user) {
    const loginSec = document.getElementById('loginSection');
    const formSec = document.getElementById('formSection');
    const statusEl = document.getElementById('loginStatus');

    await signOut(auth);
    currentUserFullName = "";
    safeRemoveLocalStorage("userEmail");

    if (statusEl) statusEl.innerText = "";
    if (loginSec) loginSec.classList.remove('hidden');
    if (formSec) formSec.classList.add('hidden');

    alert("⛔ บัญชี (" + user.email + ") ไม่มีสิทธิ์เข้าใช้งานระบบ\nกรุณาเปลี่ยนไปใช้บัญชีอื่น หรือติดต่อผู้ดูแลระบบเพื่อเพิ่มรายชื่อใน UserMaster");
}

// 📌 เครือข่าย/เซิร์ฟเวอร์มีปัญหา → "ห้าม signOut" เพื่อไม่ให้ผู้ใช้ถูกถีบออกจากระบบ
//    (สาเหตุหลักที่ทำให้ล็อกอินบนมือถือแล้วเด้งกลับหน้าล็อกอิน)
function showPermissionRetry(email, error) {
    const statusEl = document.getElementById('loginStatus');
    if (!statusEl) return;

    statusEl.innerHTML = `
        <div style="margin-top: 10px; text-align: left;">
            <span style="color: #C43D3D; font-weight: bold;">⚠️ ยังเข้าสู่ระบบอยู่ แต่ติดต่อเซิร์ฟเวอร์ตรวจสอบสิทธิ์ไม่สำเร็จ</span><br>
            <span style="color: #6B8B83; font-size: 0.78rem;">${escapeHtml(String((error && error.message) || error))}</span><br>
            <span style="color: #6B8B83; font-size: 0.75rem;">${escapeHtml(buildDiagnostics())}</span>
            <button type="button" id="btnRetryPermission" style="margin-top: 12px; padding: 9px 20px; background: linear-gradient(135deg, #0FBF94, #2EC5D3); color: white; border: none; border-radius: 999px; cursor: pointer; font-weight: 500; box-shadow: 0 12px 22px -16px rgba(11,143,112,.95);">🔄 ลองใหม่ (ไม่ต้องล็อกอินใหม่)</button>
        </div>`;

    const btn = document.getElementById('btnRetryPermission');
    if (btn) btn.onclick = () => retryPermission(email);
}

// 📌 กดปุ่ม "ลองใหม่" → ตรวจสอบสิทธิ์ซ้ำโดยคงสถานะล็อกอินไว้
async function retryPermission(email) {
    const statusEl = document.getElementById('loginStatus');
    if (statusEl) statusEl.innerHTML = `<span style="color:#0B8F70;">⏳ กำลังตรวจสอบสิทธิ์ในระบบ...</span>`;

    try {
        const results = await Promise.all([
            verifyUserPermission(email),
            ensureComponents()
        ]);
        const checkResult = results[0];
        const componentsOk = results[1];

        if (!checkResult || (!checkResult.allowed && !checkResult.isAllowed)) {
            await showDenied({ email: email });
            return;
        }
        if (!componentsOk) {
            showComponentError();
            return;
        }
        enterSystem(checkResult, auth.currentUser || { email: email });
    } catch (err) {
        console.error("Retry permission failed:", err);
        showPermissionRetry(email, err);
    }
}

// 📌 โหลดฟอร์มไม่สำเร็จ → แจ้งให้ทราบ แทนการซ่อนหน้าล็อกอินแล้วเจอจอขาว
function showComponentError() {
    const statusEl = document.getElementById('loginStatus');
    if (!statusEl) return;
    statusEl.innerHTML = `
        <div style="margin-top: 10px;">
            <span style="color: #C43D3D; font-weight: bold;">⚠️ โหลดส่วนฟอร์มไม่สำเร็จ (form.html / preview.html)</span><br>
            <button type="button" onclick="location.reload()" style="margin-top: 12px; padding: 9px 20px; background: linear-gradient(135deg, #0FBF94, #2EC5D3); color: white; border: none; border-radius: 999px; cursor: pointer; font-weight: 500; box-shadow: 0 12px 22px -16px rgba(11,143,112,.95);">🔄 โหลดหน้าใหม่</button>
        </div>`;
}

// 📌 ตัวตรวจจับสถานะการล็อกอิน
async function handleAuthState(user) {
    const loginSec = document.getElementById('loginSection');
    const formSec = document.getElementById('formSection');
    const statusEl = document.getElementById('loginStatus');

    if (user) {
        clearPendingLoginFlag();

        if (statusEl) {
            statusEl.innerHTML = `<span style="color:#27ae60;">✅ บัญชี: <b>${escapeHtml(user.email)}</b><br>⏳ กำลังเข้าสู่ระบบ...</span>`;
        }

        // 1) ตรวจสอบสิทธิ์ — ถ้าเครือข่ายมีปัญหา "ห้าม signOut"
        let checkResult = null;
        let permissionError = null;
        try {
            checkResult = await verifyUserPermission(user.email);
        } catch (err) {
            permissionError = err;
        }

        // 2) รอให้ฟอร์ม/พรีวิวพร้อม (แยกต่างหาก เพื่อไม่ให้กระทบสถานะล็อกอิน)
        const componentsOk = await ensureComponents();

        if (permissionError) {
            console.error("ตรวจสอบสิทธิ์ล้มเหลว — คงสถานะล็อกอินไว้:", permissionError);
            showPermissionRetry(user.email, permissionError);
            return;
        }

        if (!checkResult || (!checkResult.allowed && !checkResult.isAllowed)) {
            await showDenied(user);
            return;
        }

        if (!componentsOk) {
            showComponentError();
            return;
        }

        enterSystem(checkResult, user);
    } else {
        currentUserFullName = "";
        safeRemoveLocalStorage("userEmail");
        if (loginSec) loginSec.classList.remove('hidden');
        if (formSec) formSec.classList.add('hidden');
        if (statusEl) statusEl.innerText = "";
        scheduleRedirectWatchdog();
    }
}

onAuthStateChanged(auth, handleAuthState);

// 📌 ตรวจจับผลลัพธ์จากการ Redirect — เรียกทุกครั้งที่เปิดเว็บ (ไม่ผูกกับการตรวจอุปกรณ์)
getRedirectResult(auth)
    .then((result) => {
        if (result && result.user) {
            console.log("✅ ล็อกอินสำเร็จผ่าน Redirect:", result.user.email);
        }
    })
    .catch((error) => {
        console.error("Redirect login error:", error);
        displayAuthError(error);
    });

// 📌 จับกรณีกลับมาจากหน้า Google แล้ว Firebase จำ session ไม่ได้
//    (มักเกิดจาก Safari บล็อกคุกกี้ หรือโดเมนยังไม่ได้เพิ่มใน Authorized Domains)
let redirectWatchdogStarted = false;

function scheduleRedirectWatchdog() {
    const startedAt = getPendingLoginFlag();
    if (!startedAt) return;
    if (Date.now() - startedAt > 90000) { clearPendingLoginFlag(); return; }
    if (redirectWatchdogStarted) return;
    redirectWatchdogStarted = true;

    setTimeout(() => {
        redirectWatchdogStarted = false;
        if (auth.currentUser) {
            clearPendingLoginFlag();
            return;
        }
        clearPendingLoginFlag();
        const statusEl = document.getElementById('loginStatus');
        if (statusEl) statusEl.innerText = "";

        const alertEl = document.getElementById('authAlert');
        if (!alertEl) return;
        alertEl.style.display = 'block';
        alertEl.style.whiteSpace = 'pre-line';
        alertEl.innerText = (isLocalStorageUsable()
            ? "⛔ กลับมาจากหน้า Google แล้วระบบจำสถานะล็อกอินไม่ได้\nกรุณากดปุ่มเข้าใช้งานด้วย Google อีกครั้ง\nถ้ายังไม่ผ่าน ให้ปิดหน้านี้แล้วเปิดใหม่"
            : STORAGE_BLOCKED_MESSAGE) + "\n" + buildDiagnostics();
    }, 8000);
}

// 📌 แจ้งเตือนทันทีหาก Safari บล็อกการเก็บข้อมูล (สาเหตุอันดับ 1 ที่ทำให้เด้งกลับหน้าล็อกอิน)
if (!isLocalStorageUsable()) {
    displayAuthMessage(STORAGE_BLOCKED_MESSAGE + "\n" + buildDiagnostics());
}

// 📌 Safari พากลับมาจาก OAuth ด้วย bfcache → หน้าค้างสถานะเดิม ต้องตรวจสถานะใหม่
window.addEventListener('pageshow', (event) => {
    if (!event.persisted) return;
    console.log("🔄 Safari กู้หน้าจาก bfcache → ตรวจสถานะล็อกอินใหม่");
    const statusEl = document.getElementById('loginStatus');
    if (statusEl) statusEl.innerText = "";
    Promise.resolve(handleAuthState(auth.currentUser)).catch(err => console.error("pageshow auth error:", err));
});

// 📌 ฟังก์ชันตั้งค่าวันที่ปัจจุบันแบบ พ.ศ. (YYYY-MM-DD)
function initDefaultDate() {
    const today = new Date();
    const dd = String(today.getDate()).padStart(2, '0');
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const yyyyBE = today.getFullYear() + 543;
    const docDateInput = document.getElementById('docDate');
    if (docDateInput) {
        docDateInput.value = `${yyyyBE}-${mm}-${dd}`;
    }
}

// ==========================================================
// 💥 ส่วนที่ 3: จัดการข้อมูลรายการวัสดุ (Preload + Cache เร็วระดับ 0 วิ)
// ==========================================================

// 🚀 พรีโหลดรายการวัสดุจาก Cache ทันทีที่เปิดหน้าเว็บ
try {
    const cachedMaterials = sessionStorage.getItem("cachedMaterialList");
    if (cachedMaterials) {
        globalMaterialList = JSON.parse(cachedMaterials);
    }
} catch (e) {
    console.warn("Could not read material cache:", e);
}

// 🚀 ตัวแทน promise ของการดึงรายการวัสดุ (เริ่มดึงจริงหลังผู้ใช้ล็อกอินแล้ว — ดู enterSystem)
let materialsLoadingPromise = Promise.resolve(null);

function loadMaterials() {
    materialsLoadingPromise = fetchMaterialList();
    return materialsLoadingPromise;
}

async function fetchMaterialList(retryCount = 1, maxRetries = 3) {
    // ถ้ามีข้อมูลในหน่วยความจำอยู่แล้ว ให้แสดงผลทันทีไม่ต้องรอ
    if (globalMaterialList && globalMaterialList.length > 0) {
        renderAllDropdowns();
    } else if (retryCount === 1) {
        setDropdownsStatus("-- กำลังโหลดข้อมูลวัสดุ... --");
    }

    try {
        const response = await fetchWithTimeout(APPS_SCRIPT_URL, {
            method: 'POST',
            mode: 'cors',
            credentials: 'omit',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
                action: "getMaterials",
                idToken: await getAuthTokenOrNull()   // 🔒 ต้องมี token จึงจะดูรายการวัสดุได้
            })
        }, 30000);

        if (!response.ok) {
            throw new Error(`HTTP Status Error: ${response.status}`);
        }

        const textData = await response.text();
        let result;

        try {
            result = JSON.parse(textData);
        } catch (e) {
            throw new Error("ข้อมูลตอบกลับไม่อยู่ในรูปแบบ JSON");
        }

        if (result && result.success && Array.isArray(result.data)) {
            globalMaterialList = result.data;
            try {
                sessionStorage.setItem("cachedMaterialList", JSON.stringify(result.data));
            } catch (e) { }
            renderAllDropdowns();
            console.log("✅ โหลดข้อมูลวัสดุสำเร็จ");
            return result.data;
        } else {
            throw new Error(result ? result.message : "ไม่พบข้อมูลวัสดุ");
        }

    } catch (error) {
        if (retryCount < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 300));
            return await fetchMaterialList(retryCount + 1, maxRetries);
        }
        else {
            console.error("❌ ดึงข้อมูลวัสดุไม่สำเร็จ:", error.message);
            if (globalMaterialList && globalMaterialList.length > 0) {
                renderAllDropdowns();
            } else {
                setDropdownsStatus("-- การเชื่อมต่อขัดข้อง (กดที่นี่เพื่อลองใหม่) --");
            }
        }
    }
}

// 📌 ผูกขึ้น global เพื่อให้ปุ่ม "กดที่นี่เพื่อลองใหม่" ใน dropdown ใช้งานได้ (inline onclick)
window.fetchMaterialList = fetchMaterialList;

function setDropdownsStatus(message) {
    const selectElements = document.querySelectorAll('.item-name');
    selectElements.forEach(select => {
        select.innerHTML = `<option value="" onclick="fetchMaterialList()">${message}</option>`;
    });
}

function renderAllDropdowns() {
    const selectElements = document.querySelectorAll('.item-name');
    selectElements.forEach(select => {
        updateMaterialDropdown(select);
    });
}

window.updateMaterialDropdown = function (selectElement) {
    if (!selectElement) return;

    selectElement.innerHTML = `<option value="">-- เลือกรายการวัสดุสำนักงาน --</option>`;
    if (globalMaterialList && globalMaterialList.length > 0) {
        globalMaterialList.forEach(mat => {
            const opt = document.createElement('option');
            opt.value = mat.name;
            opt.text = `${mat.code} - ${mat.name} (คงเหลือ: ${mat.stock} ${mat.unit})`;

            opt.setAttribute('data-code', mat.code);
            opt.setAttribute('data-unit', mat.unit);
            opt.setAttribute('data-stock', mat.stock);

            if (mat.stock <= 0) {
                opt.style.color = "red";
            }
            selectElement.appendChild(opt);
        });
    } else {
        selectElement.innerHTML = `<option value="">-- ไม่มีข้อมูลวัสดุในระบบ --</option>`;
    }
};

window.onMaterialChange = function (selectEl) {
    const row = selectEl.closest('tr');
    if (!row) return;

    const selectedOption = selectEl.options[selectEl.selectedIndex];
    const codeInput = row.querySelector('.item-code');
    const unitInput = row.querySelector('.item-unit');
    const qtyInput = row.querySelector('.item-qty');

    if (selectedOption && selectEl.value !== "") {
        const currentStock = Number(selectedOption.getAttribute('data-stock') || 0);

        if (currentStock <= 0) {
            alert(`❌ รายการวัสดุนี้หมดคลังแล้วครับ (คงเหลือ 0) ไม่สามารถเลือกเบิกได้ครับ`);
            selectEl.value = "";
            if (codeInput) codeInput.value = "";
            if (unitInput) unitInput.value = "";
            return;
        }

        if (codeInput) codeInput.value = selectedOption.getAttribute('data-code') || "-";
        if (unitInput) unitInput.value = selectedOption.getAttribute('data-unit') || "-";

        if (qtyInput) {
            qtyInput.oninput = () => checkQuantityLimit(qtyInput);
        }
    } else {
        if (codeInput) codeInput.value = "";
        if (unitInput) unitInput.value = "";
    }
};

window.checkQuantityLimit = function (inputEl) {
    const row = inputEl.closest('tr');
    if (!row) return;

    const selectEl = row.querySelector('select');
    if (!selectEl) return;

    const selectedOption = selectEl.options[selectEl.selectedIndex];
    if (!selectedOption || selectEl.value === "") return;

    const maxStock = Number(selectedOption.getAttribute('data-stock') || 0);
    let enteredQty = Number(inputEl.value || 0);

    if (enteredQty <= 0 && inputEl.value !== "") {
        alert("❌ กรุณากรอกจำนวนเบิกให้มากกว่า 0 ครับ");
        inputEl.value = "";
        return;
    }

    // 🟢 จำนวนเบิกต้องเป็นจำนวนเต็ม (เซิร์ฟเวอร์ปฏิเสธทศนิยม เพื่อไม่ให้สต็อกเพี้ยน)
    if (isFinite(enteredQty) && enteredQty !== Math.floor(enteredQty)) {
        const floored = Math.floor(enteredQty);
        enteredQty = floored;
        inputEl.value = floored > 0 ? floored : "";
        alert("ℹ️ จำนวนเบิกต้องเป็นจำนวนเต็ม ระบบปรับให้เป็น " + (floored > 0 ? floored : 0) + " แล้วครับ");
        if (floored <= 0) return;
    }

    if (enteredQty > maxStock) {
        alert(`❌ ไม่สามารถเบิกได้เนื่องจากจำนวนสินค้าไม่พอ\n(วัสดุชิ้นนี้คงเหลือในคลังเพียง ${maxStock} เท่านั้น)`);
        inputEl.value = maxStock;
    }
};

// 🟢 3.1 ฟังก์ชันดึง Raw Data JSON ย้อนหลังมาโหลดใส่หน้า Preview (ปรับปรุงการ Normalize ข้อมูล)
export function reprintFromHistory(rawJson) {
    try {
        if (!rawJson) {
            alert("ไม่พบข้อมูลเอกสารย้อนหลังฉบับนี้ครับ");
            return;
        }

        let formData = typeof rawJson === 'string' ? JSON.parse(rawJson) : rawJson;

        // 🛡️ ปรับโครงสร้างข้อมูล items ให้ตรงเป๊ะ ไม่ว่าข้อมูลเดิมจะเก็บแบบ Object หรือ Array
        if (formData && Array.isArray(formData.items)) {
            formData.items = formData.items.map((item, idx) => {
                if (typeof item === 'object' && !Array.isArray(item)) {
                    return {
                        index: item.index || (idx + 1),
                        name: item.name || item.itemName || "-",
                        qty: item.qty || item.quantity || "1",
                        unit: item.unit || item.unitName || "-",
                        code: item.code || item.itemCode || "-",
                        reqNo: item.reqNo || "800000...............",
                        payNo: item.payNo || "490000..............."
                    };
                } else if (Array.isArray(item)) {
                    // หาก Google Sheets ส่งกลับมาเป็นตารางอาเรย์ [index, name, qty, unit, code, reqNo, payNo]
                    return {
                        index: item[0] || (idx + 1),
                        name: item[1] || "-",
                        qty: item[2] || "1",
                        unit: item[3] || "-",
                        code: item[4] || "-",
                        reqNo: item[5] || "800000...............",
                        payNo: item[6] || "490000..............."
                    };
                }
                return item;
            });
        }

        // แมปข้อมูลลง A4 Preview
        mapDataToA4Preview(formData);

        // ปิด Modal ประวัติ
        closeHistoryModal();

        const formSec = document.getElementById('formSection');
        const previewSec = document.getElementById('previewSection');
        const postSaveActions = document.getElementById('postSaveActions');

        if (formSec) formSec.classList.add('hidden');
        if (previewSec) previewSec.classList.remove('hidden');

        if (postSaveActions) {
            postSaveActions.style.display = 'flex';
            postSaveActions.classList.remove('hidden');
        }

        window.scrollTo({ top: 0, behavior: 'smooth' });

    } catch (err) {
        console.error("Reprint Error:", err);
        alert("เกิดข้อผิดพลาดในการโหลดเอกสารย้อนหลัง: " + err.message);
    }
}
window.reprintFromHistory = reprintFromHistory;

// ==========================================================
// 💥 ส่วนที่ 4: การเพิ่ม/ลบ แถวในตาราง
// ==========================================================

window.addNewRow = function () {
    const tbody = document.getElementById('itemsTableBody');
    if (!tbody) return;

    // 🟢 ตรวจสอบไม่ให้เพิ่มเกิน 8 รายการ
    if (tbody.rows.length >= 8) {
        alert("⚠️ จำกัดการเบิกสูงสุดไม่เกิน 8 รายการต่อ 1 ใบเบิก ");
        return;
    }

    rowCount++;
    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td class="row-index" style="text-align: center;">${rowCount}</td>
        <td>
            <select class="item-name" style="width:100%; padding:8px; border-radius:6px; border:1px solid #BDC3C7;" required onchange="onMaterialChange(this)"></select>
        </td>
        <td><input type="number" class="item-qty" min="1" step="1" required placeholder="0"></td>
        <td><input type="text" class="item-unit" required readonly placeholder="หน่วยนับ" style="background-color: #F0F7F4;"></td>
        <td><input type="text" class="item-code" readonly placeholder="รหัสวัสดุ" style="background-color: #F0F7F4;"></td>
        <td><input type="text" class="item-req-no" value="800000" readonly
                style="background-color: #F0F7F4; color: #64857D; cursor: not-allowed;"></td>
        <td><input type="text" class="item-pay-no" value="490000" readonly
                style="background-color: #F0F7F4; color: #64857D; cursor: not-allowed;"></td>
        <td style="text-align: center;"><button type="button" class="btn-delete-row" onclick="deleteRow(this)">❌</button></td>
    `;
    tbody.appendChild(tr);

    const newSelect = tr.querySelector('.item-name');
    updateMaterialDropdown(newSelect);
    syncReqPayInputs();
};

window.deleteRow = function (button) {
    const row = button.closest('tr');
    const tbody = row.parentNode;
    if (tbody.rows.length > 1) {
        row.remove();
        reIndexRows();
        syncReqPayInputs();
    } else {
        alert("ต้องมีรายการวัสดุอย่างน้อย 1 รายการครับ");
    }
};

// 🟢 ปลดล็อกให้กรอกได้เฉพาะ "แถวที่ 1" ส่วนแถวที่ 2 ขึ้นไปปิดการกรอก (เหมือนหน่วยงาน/แหล่งเงิน)
function syncReqPayInputs() {
    const rows = document.querySelectorAll('#itemsTableBody tr');
    rows.forEach((row, index) => {
        const isLocked = index > 0;
        ['.item-req-no', '.item-pay-no'].forEach(selector => {
            const input = row.querySelector(selector);
            if (!input) return;

            input.readOnly = isLocked;
            if (isLocked) {
                input.style.backgroundColor = '#F2F4F4';
                input.style.color = '#7F8C8D';
                input.style.cursor = 'not-allowed';
            } else {
                input.style.backgroundColor = '';
                input.style.color = '';
                input.style.cursor = '';
            }
        });
    });
}

function reIndexRows() {
    const rows = document.querySelectorAll('#itemsTableBody tr');
    let index = 0;
    rows.forEach((row) => {
        index++;
        const idxCell = row.querySelector('.row-index');
        if (idxCell) idxCell.innerText = index;
    });
    rowCount = index;
}

// ==========================================================
// 💥 ส่วนที่ 5: จัดการ Form Submission & Save to Google Sheets
// ==========================================================

window.handleFormSubmit = async function (actionType) {
    if (window.event && typeof window.event.preventDefault === 'function') window.event.preventDefault();

    // 📋 ตรวจความถูกต้องของฟอร์มก่อนเสมอ (required / min / วันที่)
    const materialForm = document.getElementById('materialForm');
    if (materialForm && typeof materialForm.reportValidity === 'function' && !materialForm.reportValidity()) {
        return;
    }

    const items = [];
    const rows = document.querySelectorAll('#itemsTableBody tr');
    let hasError = false;
    let qtyError = false;

    rows.forEach(row => {
        const nameSelect = row.querySelector('.item-name');
        const name = nameSelect ? nameSelect.value.trim() : '';
        const qty = row.querySelector('.item-qty') ? row.querySelector('.item-qty').value.trim() : '';
        const unit = row.querySelector('.item-unit') ? row.querySelector('.item-unit').value.trim() : '';
        const code = row.querySelector('.item-code') ? row.querySelector('.item-code').value.trim() : '-';

        let reqNoValue = row.querySelector('.item-req-no') ? row.querySelector('.item-req-no').value.trim() : '';
        let payNoValue = row.querySelector('.item-pay-no') ? row.querySelector('.item-pay-no').value.trim() : '';

        let reqNo = (reqNoValue === "" || reqNoValue === "800000") ? "800000..............." : reqNoValue;
        let payNo = (payNoValue === "" || payNoValue === "490000") ? "490000..............." : payNoValue;

        if (name !== "") {
            const qtyNum = Number(qty);
            if (qty === "" || !isFinite(qtyNum) || qtyNum < 1) {
                qtyError = true;
                return;
            }
            items.push({
                index: row.querySelector('.row-index') ? row.querySelector('.row-index').innerText : '',
                name: name,
                qty: qty,
                unit: unit,
                code: code,
                reqNo: reqNo,
                payNo: payNo
            });
        } else {
            hasError = true;
        }
    });

    if (items.length === 0 || hasError) {
        alert("กรุณาเลือกรายการวัสดุให้ครบถ้วนก่อนดำเนินการครับ");
        return;
    }

    // 🟢 จำนวนเบิกต้องมากกว่า 0 ทุกแถว
    if (qtyError) {
        alert("⚠️ กรุณากรอกจำนวนเบิกของทุกรายการให้มากกว่า 0 ก่อนบันทึกครับ");
        return;
    }

    // 🟢 จำกัดไม่ให้เกิน 8 รายการต่อ 1 ใบเบิก
    if (items.length > 8) {
        alert("⚠️ ระบบจำกัดการเบิกได้ไม่เกิน 8 รายการต่อ 1 ใบเบิกครับ\nกรุณาลบรายการออกให้เหลือไม่เกิน 8 รายการ");
        return;
    }

    const rawDate = document.getElementById('docDate') ? document.getElementById('docDate').value : '';
    let formattedBEData = rawDate;
    if (rawDate) {
        const dateParts = rawDate.split('-');
        if (dateParts.length === 3) {
            let year = parseInt(dateParts[0], 10);
            if (year < 2500) year += 543;
            formattedBEData = `${dateParts[2]}/${dateParts[1]}/${year}`;
        }
    }

    const formData = {
        organization: document.getElementById('organization')?.value.trim() || '-',
        docDate: formattedBEData,
        moneySource: document.getElementById('moneySource')?.value.trim() || '-',
        items: items,
        requesterName: document.getElementById('requesterName')?.value.trim() || currentUserFullName || '-',
        supplyHeadName: document.getElementById('supplyHeadName')?.value.trim() || '-',
        approverName: "..........................................................",
        accountantName: document.getElementById('accountantName')?.value.trim() || '-',
        payerName: document.getElementById('payerName')?.value.trim() || '-'
    };

    if (actionType === 'preview') {
        mapDataToA4Preview(formData);

        const previewSec = document.getElementById('previewSection');
        const postSaveActions = document.getElementById('postSaveActions');

        if (previewSec) previewSec.classList.remove('hidden');

        if (postSaveActions) {
            postSaveActions.style.display = 'none';
            postSaveActions.classList.add('hidden');
        }

        if (previewSec) previewSec.scrollIntoView({ behavior: 'smooth' });
    }
    else if (actionType === 'save') {
        const loading = document.getElementById('loadingOverlay');
        if (loading) loading.classList.remove('hidden');
        setActionButtonsDisabled(true);

        // 🔒 กันบันทึกซ้ำ: ถ้าเป็นข้อมูลชุดเดิมที่เพิ่งส่งไม่สำเร็จ (เน็ตหลุด/ตอบกลับช้า)
        //    ให้ใช้ requestId เดิม เซิร์ฟเวอร์จะรู้ว่าเคยบันทึกแล้วและไม่ตัดสต็อกรอบสอง
        const fingerprint = JSON.stringify(formData);
        if (pendingSaveFingerprint !== fingerprint) {
            pendingSaveFingerprint = fingerprint;
            pendingSaveRequestId = newRequestId();
        }
        const requestId = pendingSaveRequestId;

        // ดึง Email + ID token ของผู้ใช้งานปัจจุบัน (token ใช้ยืนยันตัวตนฝั่งเซิร์ฟเวอร์)
        const currentUserEmail = auth.currentUser ? auth.currentUser.email : (safeGetLocalStorage("userEmail") || '');
        let idToken = null;
        try { idToken = await getAuthTokenOrNull(); } catch (e) { idToken = null; }

        try {
            const response = await fetchWithTimeout(APPS_SCRIPT_URL, {
                method: 'POST',
                mode: 'cors',
                credentials: 'omit',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({
                    action: "saveData",
                    formData: formData,
                    userEmail: currentUserEmail,
                    idToken: idToken,
                    requestId: requestId
                })
            }, 60000);

            if (!response.ok) {
                throw new Error("เซิร์ฟเวอร์ตอบกลับ HTTP " + response.status);
            }

            const responseText = await response.text();
            if (responseText.trim().startsWith("<")) {
                throw new Error("Google Apps Script ตอบกลับเป็น HTML ชั่วคราว");
            }

            let result;
            try {
                result = JSON.parse(responseText);
            } catch (e) {
                throw new Error("รูปแบบข้อมูลตอบกลับจากเซิร์ฟเวอร์ผิดปกติ");
            }

            if (!result || result.success !== true) {
                throw new Error((result && result.message) || "เซิร์ฟเวอร์ไม่ยืนยันว่าบันทึกข้อมูลสำเร็จ");
            }

            // ✅ ยืนยันว่าบันทึกสำเร็จจริงเท่านั้น จึงแสดง popup สำเร็จ
            pendingSaveFingerprint = "";
            pendingSaveRequestId = "";

            mapDataToA4Preview(formData);
            await fetchMaterialList();

            showSuccessPopup(result);

        } catch (error) {
            // ❌ บันทึกไม่สำเร็จ → ห้ามขึ้น "บันทึกสำเร็จ" และคงข้อมูลฟอร์มไว้ให้ลองใหม่
            console.error("Save error:", error);
            showSaveError(error);
        } finally {
            setActionButtonsDisabled(false);
            if (loading) loading.classList.add('hidden');
        }
    }
};

// 📌 ปิด/เปิดปุ่มตัวอย่าง-บันทึก ระหว่างมีคำขอค้างอยู่ (กันกดซ้ำ)
function setActionButtonsDisabled(disabled) {
    const buttons = document.querySelectorAll('button[onclick*="handleFormSubmit"]');
    buttons.forEach(btn => {
        btn.disabled = disabled;
        btn.style.opacity = disabled ? '0.6' : '';
        btn.style.cursor = disabled ? 'not-allowed' : 'pointer';
    });
}

// 📌 แจ้งเตือนเมื่อบันทึกล้มเหลว — คงข้อมูลฟอร์มไว้ให้ผู้ใช้แก้แล้วลองใหม่
function showSaveError(error) {
    const detail = String((error && error.message) || error);
    alert("❌ บันทึกข้อมูลไม่สำเร็จ\n\nเหตุผล: " + detail +
        "\n\nข้อมูลในฟอร์มยังคงอยู่ กดปุ่มบันทึกได้อีกครั้งเมื่อพร้อม\n" +
        buildDiagnostics());
}

// ==========================================================

function mapDataToA4Preview(data) {
    if (!data) return;

    const moneySourceEl = document.getElementById('viewMoneySource');
    if (moneySourceEl) {
        moneySourceEl.innerText = data.moneySource || "-";
        moneySourceEl.parentElement.style.borderBottom = (data.moneySource && data.moneySource !== "-") ? "none" : "1px dotted #000";
    }

    const orgEl = document.getElementById('viewOrganization');
    if (orgEl) {
        orgEl.innerText = data.organization || "-";
        orgEl.parentElement.style.borderBottom = (data.organization && data.organization !== "-") ? "none" : "1px dotted #000";
    }

    const docDateEl = document.getElementById('viewDocDate');
    if (docDateEl && data.docDate) {
        docDateEl.innerText = data.docDate;
        docDateEl.parentElement.style.borderBottom = (data.docDate && data.docDate !== "-") ? "none" : "1px dotted #000";
    }

    if (document.getElementById('viewRequesterName')) document.getElementById('viewRequesterName').innerText = data.requesterName || "-";
    if (document.getElementById('viewSupplyHeadName')) document.getElementById('viewSupplyHeadName').innerText = data.supplyHeadName || "-";
    if (document.getElementById('viewApproverName')) document.getElementById('viewApproverName').innerText = data.approverName || "..........................................................";
    if (document.getElementById('viewAccountantName')) document.getElementById('viewAccountantName').innerText = data.accountantName || "-";
    if (document.getElementById('viewPayerName')) document.getElementById('viewPayerName').innerText = data.payerName || "-";

    const tbody = document.getElementById('previewTableBody');
    if (tbody) {
        tbody.innerHTML = "";
        if (Array.isArray(data.items)) {
            data.items.forEach((item, index) => {
                // 🟢 แสดงเลขที่ใบเบิก/ใบสั่งจ่าย เฉพาะรายการที่ 1 เท่านั้น (แถวอื่นเว้นว่าง)
                const isFirstRow = index === 0;
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td class="center-text">${escapeHtml(item.index || (index + 1))}</td>
                    <td>${escapeHtml(item.name || "-")}</td>
                    <td class="center-text">${escapeHtml(item.qty || "1")}</td>
                    <td class="center-text">${escapeHtml(item.unit || "-")}</td>
                    <td class="center-text">${escapeHtml(item.code || "-")}</td>
                    <td class="center-text">${escapeHtml(isFirstRow ? (item.reqNo || "800000...............") : "")}</td>
                    <td class="center-text">${escapeHtml(isFirstRow ? (item.payNo || "490000...............") : "")}</td>
                `;
                tbody.appendChild(tr);
            });
        }
    }
}
window.mapDataToA4Preview = mapDataToA4Preview;

function showSuccessPopup(result) {
    const popup = document.getElementById('successPopup');
    if (!popup) return;

    // 🟢 เดิมไม่แสดงผลลัพธ์การส่งอีเมลเลย ผู้ใช้จึงไม่รู้ว่าตัวเองไม่ได้รับไฟล์ PDF
    const noteEl = document.getElementById('successNote');
    if (noteEl) {
        const res = result || {};
        if (res.duplicate === true) {
            noteEl.style.color = '#C2761A';
            noteEl.innerText = 'ℹ️ รายการนี้เคยบันทึกเข้าระบบแล้ว ระบบไม่ตัดสต็อกซ้ำให้อีก';
        } else if (res.emailStatus && /ไม่สำเร็จ/.test(String(res.emailStatus))) {
            noteEl.style.color = '#C43D3D';
            noteEl.innerText = '⚠️ ข้อมูลถูกบันทึกแล้ว แต่ส่งอีเมลไม่สำเร็จ\n' + res.emailStatus +
                '\nกรุณากด "บันทึกเป็นไฟล์ PDF" เพื่อเก็บเอกสารไว้เอง';
        } else if (res.emailStatus) {
            noteEl.style.color = '#0B8F70';
            noteEl.innerText = '📧 ' + res.emailStatus;
        } else {
            noteEl.innerText = '';
        }
    }

    popup.classList.remove('hidden');
    popup.classList.remove('popup-hidden');
    popup.style.display = 'flex';
}

window.closePopupAndGoToPrint = function () {
    const popup = document.getElementById('successPopup');
    if (popup) {
        popup.classList.add('hidden');
        popup.style.display = 'none';
    }

    const formSec = document.getElementById('formSection');
    if (formSec) formSec.classList.add('hidden');

    const previewSec = document.getElementById('previewSection');
    if (previewSec) previewSec.classList.remove('hidden');

    const postSaveActions = document.getElementById('postSaveActions');
    if (postSaveActions) {
        postSaveActions.style.display = 'flex';
        postSaveActions.classList.remove('hidden');
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.backToForm = async function () {
    const previewSec = document.getElementById('previewSection');
    const formSec = document.getElementById('formSection');

    if (previewSec) previewSec.classList.add('hidden');

    const postSaveActions = document.getElementById('postSaveActions');
    if (postSaveActions) {
        postSaveActions.style.display = 'none';
        postSaveActions.classList.add('hidden');
    }

    if (formSec) {
        formSec.classList.remove('hidden');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    if (typeof resetForm === 'function') resetForm();

    if (typeof fetchMaterialList === 'function') {
        await fetchMaterialList();
    }
};

window.resetForm = function () {
    const form = document.getElementById('materialForm');
    if (form) form.reset();

    const tbody = document.getElementById('itemsTableBody');
    if (tbody) {
        tbody.innerHTML = `
            <tr>
                <td class="row-index" style="text-align: center;">1</td>
                <td>
                    <select id="itemSelect1" class="item-name" style="width: 100%; padding: 8px; border-radius: 6px; border: 1px solid #BDC3C7;" required onchange="onMaterialChange(this)">
                        <option value="">-- เลือกรายการวัสดุ --</option>
                    </select>
                </td>
                <td><input type="number" class="item-qty" min="1" step="1" required placeholder="0"></td>
                <td><input type="text" class="item-unit" required readonly placeholder="หน่วยนับ" style="background-color: #F0F7F4;"></td>
                <td><input type="text" class="item-code" readonly placeholder="รหัสวัสดุ" style="background-color: #F0F7F4;"></td>
                <td><input type="text" class="item-req-no" value="800000"></td>
                <td><input type="text" class="item-pay-no" value="490000"></td>
                <td style="text-align: center;"><button type="button" class="btn-delete-row" onclick="deleteRow(this)">❌</button></td>
            </tr>
        `;
    }

    rowCount = 1;
    const firstSelect = document.getElementById('itemSelect1');
    if (firstSelect) updateMaterialDropdown(firstSelect);
    syncReqPayInputs();

    initDefaultDate();

    const requesterInput = document.getElementById('requesterName');
    if (requesterInput && currentUserFullName) {
        requesterInput.value = currentUserFullName;
    }
};

// window.printDoc = function() {
//     window.print();
// };

window.openDriveFolder = function () {
    const localUrl = "./image/รายการวัสดุสำนักงาน.pdf";

    const iframe = document.getElementById('driveIframe');
    const modal = document.getElementById('driveModal');

    if (iframe) iframe.src = localUrl;
    if (modal) modal.style.display = 'flex';
};

window.closeDriveModal = function () {
    const modal = document.getElementById('driveModal');
    const iframe = document.getElementById('driveIframe');

    if (modal) modal.style.display = 'none';
    if (iframe) iframe.src = '';
};

// ==========================================================
// 📄 ฟังก์ชันแปลงเอกสาร A4 เป็น PDF (บังคับ 1 หน้าพอดี)
// ==========================================================

window.exportToPDF = async function () {
    const element = document.getElementById('previewSection');

    if (!element) {
        alert("ไม่พบเอกสารใบเบิกวัสดุครับ");
        return;
    }

    const postSaveActions = document.getElementById('postSaveActions');
    if (postSaveActions) postSaveActions.style.visibility = 'hidden';

    const loading = document.getElementById('loadingOverlay');
    if (loading) loading.classList.remove('hidden');

    // 🟢 ตั้งชื่อไฟล์ตาม "วันที่ในเอกสาร" ถ้ามี (เดิมใช้วันที่เครื่อง ทำให้ไฟล์หลายใบชื่อซ้ำกัน)
    const docDateEl = document.getElementById('viewDocDate');
    const docDateText = docDateEl ? String(docDateEl.innerText || '').trim() : '';
    const today = new Date();
    const dateString = (docDateText && docDateText !== '-')
        ? docDateText.replace(/\//g, '-')
        : `${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`;
    const fileName = `ใบเบิกวัสดุ_${dateString}.pdf`;

    // 🟢 เพิ่ม Class กระชับพื้นที่สำหรับจับภาพเป็น PDF
    element.classList.add('pdf-print-fit');

    const opt = {
        margin: 0, // 🟢 ตั้งขอบ PDF เป็น 0 เพราะคุมด้วย padding ใน CSS แทนแล้ว
        filename: fileName,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
            scale: 2,
            useCORS: true,
            logging: false,
            scrollY: 0
        },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    try {
        // รอ 0.5 วินาทีให้สไตล์ CSS ปรับเปลี่ยน
        await new Promise(resolve => setTimeout(resolve, 500));
        await html2pdf().set(opt).from(element).save();

    } catch (err) {
        console.error("PDF Export error:", err);
        alert("เกิดข้อผิดพลาดในการสร้างไฟล์ PDF: " + err.message);
    } finally {
        // 🟢 ถอด Class ออกเมื่อเสร็จสิ้น
        element.classList.remove('pdf-print-fit');

        if (postSaveActions) postSaveActions.style.visibility = 'visible';
        if (loading) loading.classList.add('hidden');
    }
};

// =======================================================
// 📜 ส่วนการทำงานของ Modal ประวัติการเบิกย้อนหลัง (History Modal)
// =======================================================

/**
 * 📜 เปิด Modal และดึงข้อมูลประวัติย้อนหลัง (กรองเฉพาะ User ปัจจุบันเท่านั้น)
 */
export async function openHistoryModal() {
    const modal = document.getElementById("historyModal");
    const tableBody = document.getElementById("historyTableBody");

    if (!modal || !tableBody) return;

    // 1. เปิดแสดง Modal และขึ้นสถานะกำลังโหลด
    modal.classList.remove("hidden");
    tableBody.innerHTML = `<tr><td colspan="4" style="text-align:center;">⌛ กำลังโหลดข้อมูลประวัติ...</td></tr>`;

    // 2. ดึงอีเมลผู้ใช้งานปัจจุบันที่ล็อกอินอยู่
    const currentUserEmail = auth.currentUser ? auth.currentUser.email : (safeGetLocalStorage("userEmail") || "");

    if (!currentUserEmail) {
        tableBody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:#C2761A;">⚠️ กรุณาล็อกอินเข้าสู่ระบบก่อนดึงประวัติการเบิก</td></tr>`;
        return;
    }

    try {
        // 3. ส่งคำขอแบบ POST ไปยัง Google Apps Script พร้อมส่ง Email ไปกรอง
        const response = await fetchWithTimeout(APPS_SCRIPT_URL, {
            method: "POST",
            mode: "cors",
            credentials: "omit",
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
                action: "getUserHistory",
                email: currentUserEmail.trim().toLowerCase(), // ส่ง Email เป็นอักษรตัวเล็กทั้งหมด
                idToken: await getAuthTokenOrNull()          // ใช้ยืนยันตัวตนจริงฝั่งเซิร์ฟเวอร์
            })
        }, 30000);

        const textData = await response.text();
        const result = JSON.parse(textData);

        if (result.success && Array.isArray(result.data)) {
            // 🛡️ Client-side Double Security Filter: กรองเฉพาะรายการที่ตรงกับ Email ของผู้ใช้ปัจจุบันเท่านั้น
            const myHistoryList = result.data.filter(item => {
                const itemEmail = (item.userEmail || item.email || "").trim().toLowerCase();
                return itemEmail === currentUserEmail.trim().toLowerCase();
            });

            // 4. ตรวจสอบว่ามีรายการย้อนหลังเฉพาะของ User นี้หรือไม่
            if (myHistoryList.length > 0) {
                tableBody.innerHTML = "";
                myHistoryList.forEach((item, index) => {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
            <td style="text-align:center;">${index + 1}</td>
            <td style="text-align:center;">${escapeHtml(item.docDate || "-")}</td>
            <td style="text-align:center;">${escapeHtml(item.saveTime || "-")}</td>
            <td style="text-align:center;">
              <button type="button" class="btn-history-print" 
                      style="padding: 6px 14px; background: linear-gradient(135deg, #16C79A, #0B8F70); color: white; border: none; border-radius: 999px; font-size: 0.85rem; font-weight: 500; cursor: pointer; transition: transform 0.2s ease, box-shadow 0.2s ease; box-shadow: 0 10px 18px -14px rgba(11,143,112,.95);">
                📄 ดู/พิมพ์ (${item.itemCount || 0} รายการ)
              </button>
            </td>
          `;

                    // ผูก Event ปุ่มกดพิมพ์ย้อนหลัง
                    const printBtn = tr.querySelector('.btn-history-print');
                    if (printBtn) {
                        printBtn.onclick = () => {
                            let jsonData = item.rawJson || item.formData;

                            if (!jsonData) {
                                console.error("Data missing for item:", item);
                                alert("ไม่พบข้อมูลเอกสารย้อนหลังฉบับนี้ครับ กรุณาตรวจสอบการบันทึกข้อมูลใน Google Sheets");
                                return;
                            }

                            reprintFromHistory(jsonData);
                        };
                    }

                    tableBody.appendChild(tr);
                });
            } else {
                // ไม่มีรายการของ User นี้
                tableBody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:#6B8B83;">ไม่พบประวัติการบันทึกย้อนหลังของบัญชีนี้ (${escapeHtml(currentUserEmail)})</td></tr>`;
            }
        } else {
            // ⚠️ เซิร์ฟเวอร์ตอบ success:false → ต้องบอกสาเหตุจริง (เช่น ยืนยันตัวตนไม่ผ่าน)
            //    ห้ามกลบเป็น “ไม่พบประวัติ” เพราะจะทำให้เข้าใจผิดว่ายังไม่เคยเบิก
            const serverMsg = (result && result.message)
                ? String(result.message)
                : "เซิร์ฟเวอร์ไม่ตอบกลับข้อมูลประวัติ";
            tableBody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:#C43D3D; white-space:pre-line;">⚠️ ${escapeHtml(serverMsg)}</td></tr>`;
        }
    } catch (error) {
        console.error("Error fetching history:", error);
        tableBody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:red;">เกิดข้อผิดพลาดในการโหลดข้อมูลประวัติ<br><span style="font-size:0.85rem;">${escapeHtml(String((error && error.message) || error))}</span></td></tr>`;
    }
}

/**
 * ❌ ปิด Modal ประวัติ
 */
export function closeHistoryModal() {
    const modal = document.getElementById("historyModal");
    if (modal) {
        modal.classList.add("hidden");
    }
}

// 🔗 ผูกฟังก์ชันเข้ากับ Global Window Object เพื่อให้ onclick บน HTML เรียกใช้งานได้ในระบบ ES Module
window.openHistoryModal = openHistoryModal;
window.closeHistoryModal = closeHistoryModal;

// 📌 แจ้ง index.html ว่าโมดูลโหลดสำเร็จแล้ว (ใช้โดย inline fallback ใน index.html)
window.__rxModuleReady = true;

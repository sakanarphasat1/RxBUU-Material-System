// ==========================================================
// 💥 ส่วนที่ 1: การตั้งค่าระบบ (Configuration)
// ==========================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getAuth, 
    signInWithPopup, 
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

// ตัวแปรส่วนกลาง (Global Variables)
let rowCount = 1;
let globalMaterialList = [];
let currentUserFullName = ""; 

// ==========================================================
// 💥 ส่วนที่ 2: ระบบยืนยันตัวตน (Authentication) & โหลดหน้าเว็บ
// ==========================================================

// 📌 ฟังก์ชันล็อกอินด้วย Google ผ่าน Firebase Popup
window.loginWithGoogle = async function() {
    const statusEl = document.getElementById('loginStatus');
    const alertEl = document.getElementById('authAlert');
    if (alertEl) alertEl.style.display = 'none';
    if (statusEl) statusEl.innerText = "กำลังเชื่อมต่อ Google...";

    try {
        await signOut(auth);
        await signInWithPopup(auth, provider);
    } catch (error) {
        console.error("Login failed:", error);
        if (alertEl) {
            alertEl.style.display = 'block';
            alertEl.innerText = "เกิดข้อผิดพลาดในการเข้าสู่ระบบ: " + error.message;
        }
        if (statusEl) statusEl.innerText = "";
    }
};

// 📌 ฟังก์ชันช่วยตรวจสอบสิทธิ์ใน UserMaster (พร้อมระบบ Retry อัตโนมัติ 3 ครั้ง)
async function verifyUserPermission(email, retryCount = 1, maxRetries = 3) {
    const statusEl = document.getElementById('loginStatus');
    
    if (statusEl) {
        statusEl.innerText = retryCount === 1 
            ? "กำลังตรวจสอบสิทธิ์ในระบบ..." 
            : `กำลังพยายามตรวจสอบสิทธิ์อีกครั้ง (${retryCount}/${maxRetries})...`;
    }

    try {
        const response = await fetch(APPS_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
                action: "checkUser",
                email: email
            })
        });

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
        console.warn(`⚠️ ตรวจสอบสิทธิ์ล้มเหลว ครั้งที่ ${retryCount}/${maxRetries}:`, error.message);

        if (retryCount < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 1500));
            return await verifyUserPermission(email, retryCount + 1, maxRetries);
        } else {
            throw error;
        }
    }
}

// 📌 ตัวตรวจจับสถานะการล็อกอิน
onAuthStateChanged(auth, async (user) => {
    const loginSec = document.getElementById('loginSection');
    const formSec = document.getElementById('formSection');
    const statusEl = document.getElementById('loginStatus');

    if (user) {
        try {
            const checkResult = await verifyUserPermission(user.email);

            if (!checkResult || (!checkResult.allowed && !checkResult.isAllowed)) {
                await signOut(auth);
                currentUserFullName = "";
                localStorage.removeItem("userEmail"); // ลบอีเมลเมื่อไม่มีสิทธิ์
                
                if (statusEl) statusEl.innerText = "";
                if (loginSec) loginSec.classList.remove('hidden');
                if (formSec) formSec.classList.add('hidden');

                alert(`⛔ บัญชี (${user.email}) ไม่มีสิทธิ์เข้าใช้งานระบบ\nกรุณาเปลี่ยนไปใช้บัญชีอื่น หรือติดต่อผู้ดูแลระบบเพื่อเพิ่มรายชื่อใน UserMaster`);
                return;
            }

            // 💾 บันทึกอีเมลลง localStorage สำหรับใช้งานทั่วระบบ
            localStorage.setItem("userEmail", user.email);

            currentUserFullName = checkResult.fullName || user.displayName || user.email;

            if (loginSec) loginSec.classList.add('hidden');
            
            await loadComponent('formSection', 'form.html');
            await loadComponent('previewSection', 'preview.html');
            
            if (formSec) formSec.classList.remove('hidden');
            
            const requesterInput = document.getElementById('requesterName');
            if (requesterInput) {
                requesterInput.value = currentUserFullName;
            }

            await fetchMaterialList();
            initDefaultDate();
            
            if (statusEl) statusEl.innerText = "";

        } catch (err) {
            console.error("Error loading user session:", err);
            await signOut(auth);
            localStorage.removeItem("userEmail");
            
            if (statusEl) {
                statusEl.innerHTML = `
                    <div style="margin-top: 10px;">
                        <span style="color: #e74c3c; font-weight: bold;">เกิดข้อผิดพลาดในการตรวจสอบสิทธิ์</span><br>
                        <button type="button" onclick="location.reload()" style="margin-top: 8px; padding: 6px 14px; background-color: #3498db; color: white; border: none; border-radius: 4px; cursor: pointer;">
                            🔄 กดเพื่อลองใหม่อีกครั้ง
                        </button>
                    </div>
                `;
            }
        }
    } else {
        currentUserFullName = "";
        localStorage.removeItem("userEmail");
        if (loginSec) loginSec.classList.remove('hidden');
        if (formSec) formSec.classList.add('hidden');
        if (statusEl) statusEl.innerText = "";
    }
});

// 📌 ฟังก์ชันช่วยโหลดคอมโพเนนต์ HTML
async function loadComponent(elementId, filePath) {
    try {
        const response = await fetch(filePath);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const html = await response.text();
        const el = document.getElementById(elementId);
        if (el) el.innerHTML = html;
    } catch (error) {
        console.error(`Error loading ${filePath}:`, error);
    }
}

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
// 💥 ส่วนที่ 3: จัดการข้อมูลรายการวัสดุ
// ==========================================================

async function fetchMaterialList(retryCount = 1, maxRetries = 3) {
    if (retryCount === 1) {
        setDropdownsStatus("-- กำลังโหลดข้อมูลวัสดุ... --");
    } else {
        setDropdownsStatus(`-- กำลังพยายามเชื่อมต่อใหม่ (ครั้งที่ ${retryCount}/${maxRetries})... --`);
    }

    try {
        const response = await fetch(APPS_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: "getMaterials" })
        });

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
            renderAllDropdowns();
            console.log("✅ โหลดข้อมูลวัสดุสำเร็จ");
            return;
        } else {
            throw new Error(result ? result.message : "ไม่พบข้อมูลวัสดุ");
        }

    } catch (error) {
        console.warn(`⚠️ ดึงข้อมูลวัสดุล้มเหลว ครั้งที่ ${retryCount}/${maxRetries}:`, error.message);

        if (retryCount < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 2000));
            return await fetchMaterialList(retryCount + 1, maxRetries);
        } 
        else {
            console.error("❌ พยายามเชื่อมต่อครบ 3 ครั้งแล้วไม่สำเร็จ");
            if (globalMaterialList && globalMaterialList.length > 0) {
                renderAllDropdowns();
                alert("⚠️ ไม่สามารถอัปเดตรายการวัสดุล่าสุดได้ ระบบจะใช้ข้อมูลรายการเดิมชั่วคราวครับ");
            } else {
                setDropdownsStatus("-- การเชื่อมต่อขัดข้อง (กดที่นี่เพื่อลองใหม่) --");
                alert("⛔ ไม่สามารถดึงข้อมูลรายการวัสดุได้หลังจากพยายาม 3 ครั้ง\nกรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ต แล้วลองใหม่อีกครั้งครับ");
            }
        }
    }
}

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

window.updateMaterialDropdown = function(selectElement) {
    if (!selectElement) return;
    
    selectElement.innerHTML = `<option value="">-- เลือกรายการวัสดุ --</option>`;
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

window.onMaterialChange = function(selectEl) {
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

window.checkQuantityLimit = function(inputEl) {
    const row = inputEl.closest('tr');
    if (!row) return;
    
    const selectEl = row.querySelector('select');
    if (!selectEl) return;
    
    const selectedOption = selectEl.options[selectEl.selectedIndex];
    if (!selectedOption || selectEl.value === "") return;
    
    const maxStock = Number(selectedOption.getAttribute('data-stock') || 0);
    const enteredQty = Number(inputEl.value || 0);
    
    if (enteredQty <= 0 && inputEl.value !== "") {
        alert("❌ กรุณากรอกจำนวนเบิกให้มากกว่า 0 ครับ");
        inputEl.value = "";
        return;
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
        const printActionButtons = document.getElementById('printActionButtons');

        if (formSec) formSec.classList.add('hidden');
        if (previewSec) previewSec.classList.remove('hidden');
        if (printActionButtons) printActionButtons.classList.add('hidden');

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

window.addNewRow = function() {
    const tbody = document.getElementById('itemsTableBody');
    if (!tbody) return;

    // 🟢 ตรวจสอบไม่ให้เพิ่มเกิน 11 รายการ
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
        <td><input type="number" class="item-qty" min="1" required placeholder="0"></td>
        <td><input type="text" class="item-unit" required readonly placeholder="หน่วยนับ" style="background-color: #f3f4f6;"></td>
        <td><input type="text" class="item-code" readonly placeholder="รหัสวัสดุ" style="background-color: #f3f4f6;"></td>
        <td><input type="text" class="item-req-no" value="800000"></td>
        <td><input type="text" class="item-pay-no" value="490000"></td>
        <td style="text-align: center;"><button type="button" class="btn-delete-row" onclick="deleteRow(this)">❌</button></td>
    `;
    tbody.appendChild(tr);
    
    const newSelect = tr.querySelector('.item-name');
    updateMaterialDropdown(newSelect);
};

window.deleteRow = function(button) {
    const row = button.closest('tr');
    const tbody = row.parentNode;
    if (tbody.rows.length > 1) {
        row.remove();
        reIndexRows();
    } else {
        alert("ต้องมีรายการวัสดุอย่างน้อย 1 รายการครับ");
    }
};

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

window.handleFormSubmit = async function(actionType) {
    if (window.event) window.event.preventDefault();
    
    const items = [];
    const rows = document.querySelectorAll('#itemsTableBody tr');
    let hasError = false;

    rows.forEach(row => {
        const nameSelect = row.querySelector('.item-name');
        const name = nameSelect ? nameSelect.value.trim() : '';
        const qty = row.querySelector('.item-qty') ? row.querySelector('.item-qty').value.trim() : '0';
        const unit = row.querySelector('.item-unit') ? row.querySelector('.item-unit').value.trim() : '';
        const code = row.querySelector('.item-code') ? row.querySelector('.item-code').value.trim() : '-';
        
        let reqNoValue = row.querySelector('.item-req-no') ? row.querySelector('.item-req-no').value.trim() : '';
        let payNoValue = row.querySelector('.item-pay-no') ? row.querySelector('.item-pay-no').value.trim() : '';
        
        let reqNo = (reqNoValue === "" || reqNoValue === "800000") ? "800000..............." : reqNoValue;
        let payNo = (payNoValue === "" || payNoValue === "490000") ? "490000..............." : payNoValue;
        
        if (name !== "") {
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
    // 🟢 เพิ่มการตรวจสอบไม่ให้เกิน 11 รายการก่อน บันทึก/พรีวิว
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
        const printActionButtons = document.getElementById('printActionButtons');
        const postSaveActions = document.getElementById('postSaveActions');

        if (previewSec) previewSec.classList.remove('hidden');
        
        if (printActionButtons) printActionButtons.classList.remove('hidden');
        if (postSaveActions) {
            postSaveActions.style.display = 'none';
            postSaveActions.classList.add('hidden');
        }
        
        if (previewSec) previewSec.scrollIntoView({ behavior: 'smooth' });
    }
    else if (actionType === 'save') {
        const loading = document.getElementById('loadingOverlay');
        if (loading) loading.classList.remove('hidden');

        // ดึง Email ของผู้ใช้งานปัจจุบัน
        const currentUserEmail = auth.currentUser ? auth.currentUser.email : (localStorage.getItem("userEmail") || '');

        try {
            const response = await fetch(APPS_SCRIPT_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ 
                    action: "saveData", 
                    formData: formData,
                    userEmail: currentUserEmail 
                })
            });

            const responseText = await response.text();
            let result;
            try {
                result = JSON.parse(responseText);
            } catch (e) {
                result = { success: true }; 
            }

            mapDataToA4Preview(formData);
            await fetchMaterialList(); 
            
            showSuccessPopup();

        } catch (error) {
            console.error("Save error:", error);
            mapDataToA4Preview(formData);
            showSuccessPopup();
        } finally {
            if (loading) loading.classList.add('hidden');
        }
    }
};

// ==========================================================
// 💥 ส่วนที่ 6: Mapping เอกสาร A4 & Helper Functions
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
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td class="center-text">${item.index || (index + 1)}</td>
                    <td>${item.name || "-"}</td>
                    <td class="center-text">${item.qty || "1"}</td>
                    <td class="center-text">${item.unit || "-"}</td>
                    <td class="center-text">${item.code || "-"}</td>
                    <td class="center-text">${item.reqNo || "800000..............."}</td>
                    <td class="center-text">${item.payNo || "490000..............."}</td>
                `;
                tbody.appendChild(tr);
            });
        }
    }
}
window.mapDataToA4Preview = mapDataToA4Preview;

function showSuccessPopup() {
    const popup = document.getElementById('successPopup');
    if (popup) {
        popup.classList.remove('hidden');
        popup.classList.remove('popup-hidden');
        popup.style.display = 'flex';
    }
}

window.closePopupAndGoToPrint = function() {
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

window.backToForm = async function() {
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

window.resetForm = function() {
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
                <td><input type="number" class="item-qty" min="1" required placeholder="0"></td>
                <td><input type="text" class="item-unit" required readonly placeholder="หน่วยนับ" style="background-color: #f3f4f6;"></td>
                <td><input type="text" class="item-code" readonly placeholder="รหัสวัสดุ" style="background-color: #f3f4f6;"></td>
                <td><input type="text" class="item-req-no" value="800000"></td>
                <td><input type="text" class="item-pay-no" value="490000"></td>
                <td style="text-align: center;"><button type="button" class="btn-delete-row" onclick="deleteRow(this)">❌</button></td>
            </tr>
        `;
    }
    
    rowCount = 1;
    const firstSelect = document.getElementById('itemSelect1');
    if (firstSelect) updateMaterialDropdown(firstSelect);
    
    initDefaultDate();

    const requesterInput = document.getElementById('requesterName');
    if (requesterInput && currentUserFullName) {
        requesterInput.value = currentUserFullName;
    }
};

window.printDoc = function() {
    window.print();
};

window.openDriveFolder = function() {
    const pdfFileId = "1qsFQ01jGrgofyYvxxxrJ6rOPYJyoIZBW"; 
    const driveUrl = "https://drive.google.com/file/d/" + pdfFileId + "/preview";
    
    const iframe = document.getElementById('driveIframe');
    const modal = document.getElementById('driveModal');
    
    if (iframe) iframe.src = driveUrl;
    if (modal) modal.style.display = 'flex';
};

window.closeDriveModal = function() {
    const modal = document.getElementById('driveModal');
    const iframe = document.getElementById('driveIframe');
    
    if (modal) modal.style.display = 'none';
    if (iframe) iframe.src = '';
};

// ==========================================================
// 📄 ฟังก์ชันแปลงเอกสาร A4 เป็น PDF (บังคับ 1 หน้าพอดี)
// ==========================================================

window.exportToPDF = async function() {
    const element = document.getElementById('previewSection');

    if (!element) {
        alert("ไม่พบเอกสารใบเบิกวัสดุครับ");
        return;
    }

    const postSaveActions = document.getElementById('postSaveActions');
    if (postSaveActions) postSaveActions.style.visibility = 'hidden';

    const loading = document.getElementById('loadingOverlay');
    if (loading) loading.classList.remove('hidden');

    const today = new Date();
    const dateString = `${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`;
    const fileName = `ใบเบิกวัสดุ_${dateString}.pdf`;

    // 🟢 เพิ่ม Class กระชับพื้นที่สำหรับจับภาพเป็น PDF
    element.classList.add('pdf-print-fit');

    const opt = {
        margin:       0, // 🟢 ตั้งขอบ PDF เป็น 0 เพราะคุมด้วย padding ใน CSS แทนแล้ว
        filename:     fileName,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { 
            scale: 2,
            useCORS: true,
            logging: false,
            scrollY: 0
        },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    try {
        // รอ 0.25 วินาทีให้สไตล์ CSS ปรับเปลี่ยน
        await new Promise(resolve => setTimeout(resolve, 250));
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
  const currentUserEmail = auth.currentUser ? auth.currentUser.email : (localStorage.getItem("userEmail") || ""); 

  if (!currentUserEmail) {
    tableBody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:#e67e22;">⚠️ กรุณาล็อกอินเข้าสู่ระบบก่อนดึงประวัติการเบิก</td></tr>`;
    return;
  }

  try {
    // 3. ส่งคำขอแบบ POST ไปยัง Google Apps Script พร้อมส่ง Email ไปกรอง
    const response = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: "getUserHistory",
        email: currentUserEmail.trim().toLowerCase() // ส่ง Email เป็นอักษรตัวเล็กทั้งหมด
      })
    });

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
            <td style="text-align:center;">${item.docDate || "-"}</td>
            <td style="text-align:center;">${item.saveTime || "-"}</td>
            <td style="text-align:center;">
              <button type="button" class="btn-history-print" 
                      style="padding: 5px 12px; background-color: #27ae60; color: white; border: none; border-radius: 6px; font-size: 0.85rem; font-weight: 500; cursor: pointer; transition: 0.2s;">
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
        // หากไม่มีรายการของ User นี้
        tableBody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:#888;">ไม่พบประวัติการบันทึกย้อนหลังของบัญชีนี้ (${currentUserEmail})</td></tr>`;
      }
    } else {
      tableBody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:#888;">ไม่พบประวัติการบันทึกย้อนหลังของบัญชีนี้ (${currentUserEmail})</td></tr>`;
    }
  } catch (error) {
    console.error("Error fetching history:", error);
    tableBody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:red;">เกิดข้อผิดพลาดในการโหลดข้อมูลประวัติ</td></tr>`;
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

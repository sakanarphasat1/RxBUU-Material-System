# RxBUU Material System
ระบบใบเบิกวัสดุ คณะเภสัชศาสตร์

---

## 🔑 ตั้งค่าที่ต้องเช็ก เมื่อล็อกอินบนมือถือไม่ได้ (เด้งกลับหน้าล็อกอิน)

ปัญหานี้มักไม่ใช่โค้ด แต่เป็นการตั้งค่า Firebase/Google ครับ เช็กตามลำดับนี้

1. **Firebase Console → Authentication → Settings → Authorized Domains**
   ต้องมีโดเมนที่ผู้ใช้เปิดจริงทุกตัว เช่น

   | โดเมน | เมื่อไหร่ที่ใช้ |
   |---|---|
   | `localhost` | เปิดบนคอมผ่าน XAMPP (`http://localhost/...`) |
   | `pharmacy-material-system.firebaseapp.com` | โดเมน Firebase |
   | `pharmacy-material-system.web.app` | โดเมน Firebase |
   | `<user>.github.io` | เปิดผ่าน GitHub Pages |
   | โดเมนที่ใช้บน iPhone จริง | เอาจากบรรทัด `host=` ในกล่องแดงหน้าล็อกอิน |

   > ⚠️ ถ้าคอมเปิดผ่าน `localhost` แต่ iPhone เปิดผ่าน GitHub Pages แล้ว GitHub Pages
   > ยังไม่ได้อยู่ในรายการ → ล็อกอินบน iPhone จะล้มเหลวเสมอ

2. **Google Cloud Console → APIs & Services → Credentials → OAuth Client (Web)**
   → *Authorized JavaScript origins* ต้องครอบคลุมโดเมนเดียวกัน

3. อย่าเปิดเว็บด้วย `file://` — ES Module และ `fetch(form.html)` จะถูกบล็อกทันที

4. แก้ `code.gs.txt` แล้วต้อง **Deploy ใหม่** ใน Apps Script:
   *Deploy → Manage deployments → ไอคอนดินสอ → Version: New version → Deploy*
   ถ้าไม่ทำขั้นตอนนี้ เซิร์ฟเวอร์จะยังเป็นโค้ดเก่าอยู่

---

## 🩺 อ่านข้อผิดพลาดจากหน้าล็อกอิน

เมื่อล็อกอินล้มเหลว กล่องแดงจะมีบรรทัดวินิจฉัยต่อท้าย เช่น

```
host=xxx.github.io | storage=ปกติ | device=มือถือ | user=ยังไม่มี [auth/unauthorized-domain]
```

| สัญญาณ | ความหมาย / วิธีแก้ |
|---|---|
| `storage=ถูกบล็อก` | Safari บล็อกคุกกี้ → ปิด *บล็อกคุกกี้ทั้งหมด* หรือออกจากโหมดไม่ระบุตัวตน |
| `[auth/unauthorized-domain]` | โดเมนนี้ยังไม่อยู่ใน Authorized Domains → ข้อ 1 ด้านบน |
| ไม่มี `[...]` | ปัญหาเครือข่าย/ Apps Script ยังไม่ตื่น → กดปุ่ม *🔄 ลองใหม่* ได้โดยไม่ต้องล็อกอินใหม่ |
| `⚠️ ระบบยังโหลดไม่สำเร็จ` | `script.js` โหลดไม่ถึง (gstatic ช้า/ถูกบล็อก) → รีเฟรชหน้า |

---

## 🔒 การยืนยันตัวตนฝั่งเซิร์ฟเวอร์ ( Firebase ID token )

* `saveData` และ `getUserHistory` จะตรวจ **Firebase ID token** ก่อนทำอะไรทั้งสิ้น
  โดยตรวจผ่าน `oauth2.googleapis.com/tokeninfo` เป็นทางหลัก (ไม่ต้องใช้ API key)
  และถ้าล้มเหลวจะลอง `identitytoolkit.googleapis.com/v1/accounts:lookup` เป็นทางสำรอง
* ฝั่งเว็บส่ง `idToken` ไปพร้อมคำขอทุกครั้ง และ **อีเมลที่ใช้จริงมาจาก token ไม่ใช่จาก body**
  → ยิงคำขอตรงมาโดยไม่ล็อกอิน จะได้ข้อความ `การยืนยันตัวตนล้มเหลว ...`
* **ต้องรัน `authorizeExternalRequest` 1 ครั้ง** (ดูหัวข้อถัดไป) ไม่เช่นนั้น Apps Script
  จะไม่มีสิทธิ์เรียก `UrlFetchApp` และการยืนยันตัวตนจะล้มเหลวทุกครั้ง
* การตัดสต็อก: ระบบ**ปฏิเสธ**ทันทีเมื่อจำนวนเบิกมากกว่าคงเหลือ
  (เดิมเคยตัดจนเหลือ 0 ทำให้สต็อกเพี้ยน) และจะไม่เขียนตารางใดๆ ถ้ายังตรวจไม่ผ่าน

---

## ⚠️ หลังแก้ `code.gs.txt` ต้องทำ 2 ขั้นนี้เสมอ (ไม่งั้นบันทึก/ดูประวัติจะล้มเหลว)

1. **ให้สิทธิ์ UrlFetchApp ก่อน**
   * เปิด Apps Script → เลือกฟังก์ชัน **`authorizeExternalRequest`** จากช่องรายการด้านบน
     แล้วกด **Run** → กด **Allow / อนุญาต** ในหน้าต่างที่เด้งขึ้น
   * ดู Log ด้านล่างขึ้น `UrlFetchApp ใช้งานได้แล้ว — HTTP 400` = ปกติ (400 เพราะ token ที่ส่งไปเป็นตัวหลอก)
2. **Deploy เวอร์ชันใหม่**
   * *Deploy → Manage deployments → ไอคอนดินสอ → Version: **New version** → Deploy*
   * URL เดิม (`.../exec`) ใช้ต่อได้เลย ไม่ต้องแก้ `script.js`

### รหัสสาเหตุเวลายืนยันตัวตนไม่ผ่าน (ขึ้นในกล่องข้อความตอนกดบันทึก/ดูประวัติ)

| รหัส | ความหมาย / วิธีแก้ |
|---|---|
| `AUTH-01` | หน้าเว็บไม่ได้แนบ token มา → ออกจากระบบแล้วล็อกอินใหม่ |
| `AUTH-02` | รูปแบบ token เพี้ยน → ล้างแคชเบราว์เซอร์ (`index.html` ตัวนี้กันแคชไว้แล้ว) |
| `AUTH-03` | token หมดอายุ → ล็อกอินใหม่ |
| `AUTH-04` | **ยังไม่ได้ทำขั้นตอนที่ 1** → รัน `authorizeExternalRequest` แล้ว Deploy ใหม่ |
| `AUTH-05` / `AUTH-06` | token มาจากคนละโปรเจกต์ Firebase → เช็ก `firebaseConfig` ใน `script.js` |
| `AUTH-07` | ติดต่อ Google ไม่ได้ (เน็ต/นโยบายไอทีของหน่วยงาน) → ดูข้อความต่อท้ายในวงเล็บ |

ถ้า deploy แล้วยัง **“ไม่พบประวัติการเบิก”** ทั้งที่เคยเบิกไปแล้ว ให้ยิง action ชื่อ
`historyDiag` (ต้องแนบ `idToken` ของผู้ใช้) จะได้ `totalRows`, `myRows`, `rowsWithoutEmail`
มาบอกได้ทันทีว่ายังไม่เคยบันทึก หรือบันทึกแล้วแต่คอลัมน์ K (Email ผู้เบิก) ไม่ตรงกับอีเมลที่ล็อกอิน

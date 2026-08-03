# REQUIREMENTS — ระบบบริหารวงจรชีวิต SSL Certificate

## 1. เป้าหมายของระบบ

ระบบจะช่วยให้สามารถ:
- Import ข้อมูล Certificate จาก Excel
- ติดตาม Certificate ของลูกค้าแต่ละบริษัท
- ติดตามงานต่ออายุ Certificate
- แจ้งเตือนก่อนหมดอายุ
- ดู Dashboard และรายงานย้อนหลัง
- Export รายงาน

> Excel เป็นเพียง "ช่องทางนำเข้าข้อมูล" ไม่ใช่แหล่งข้อมูลหลักของระบบ

## 2. การ Import Excel

**ห้ามอ่านข้อมูลจากตำแหน่งคอลัมน์** (เช่น Column B = Common Name) เพราะถ้าสลับคอลัมน์ระบบจะพัง

**ต้องอ่านจากชื่อ Header** เช่น: Common Name, Endpoints, Expires, Days Until, Owner, Status

**ต้องมี Header Mapping** เช่น `Common Name` / `Certificate Name` / `CN` → map เป็น `commonName` เดียวกัน

**ต้อง Validate ก่อน Import** — หาก Header ที่จำเป็นหาย (เช่น `Days Until`) ให้ Import ไม่ผ่าน พร้อมแจ้ง missing column

## 3. ห้ามเก็บข้อมูลเป็น JavaScript

ปัจจุบันข้อมูลถูกเก็บแบบ `const allData = [...]` ซึ่งต้องแก้โค้ดทุกเดือน

ต้องเปลี่ยนเป็น: **Excel → Import API → Database → Dashboard**
(Dashboard ดึงข้อมูลจาก Database เท่านั้น)

## 4. Company เป็นหัวใจของระบบ

ปัญหาเดิม: ไม่รู้ว่า Certificate เป็นของบริษัทไหน

แนวทาง:
- มีเมนู Companies (เช่น SME Bank, PTT, SCG, CP)
- เมื่อ Import ผู้ใช้ต้อง**เลือกบริษัทก่อน** ข้อมูลทั้งหมดถูกผูกกับ `company_id` ทันที
- ไม่ต้องให้ Excel มีชื่อบริษัท

## 5. โครงสร้างข้อมูล

```
Company → Site (Optional) → Certificate → Renewal Task → History → Notification
```

รองรับอนาคต: หลายบริษัท, หลาย Site, หลาย Certificate

## 6. Certificate Risk (คำนวณอัตโนมัติ)

| วันคงเหลือ | Risk |
|---|---|
| < 30 วัน | High |
| 31–60 วัน | Medium |
| 61–90 วัน | Low |
| > 90 วัน | Safe |

## 7. Work Status

ไม่ควรมีแค่ Pending/Done ต้องเป็น Workflow:

```
New → Assigned → In Progress → Waiting Vendor → Waiting CA → Testing → Completed
(ยกเลิกได้ → Cancelled)
```

เพื่อให้รู้ว่างานติดอยู่ขั้นตอนไหน

## 8. Risk กับ Status ต้องแยกกัน

ตัวอย่าง: Certificate เหลือ 20 วัน แต่ Status = Completed
แปลว่าต่ออายุเสร็จแล้ว แต่ใบเก่ายังไม่หมดอายุ
→ **Risk และ Work Status ต้องเป็นคนละฟิลด์**

## 9. Notification

แจ้งเตือนอัตโนมัติแบบขั้นบันได:

| เหลือ | ช่องทาง |
|---|---|
| 90 วัน | Email |
| 60 วัน | Email + LINE |
| 30 วัน | Critical |
| 7 วัน | แจ้งทุกวัน |

## 10. Dashboard

หน้าแรกแสดง: Total Certificates, High Risk, Expiring Soon, Completed, Pending, Expired
กดเลือกบริษัท (เช่น SME Bank) → Dashboard เปลี่ยนเป็นของบริษัทนั้นทันที

## 11. Certificate Detail

เมื่อกด Certificate ต้องเห็น: Common Name, SAN, Issuer, Serial Number,
Signature Algorithm, Key Size, SHA256, Endpoint, Owner, History, Attachment
(เหมือนระบบ Asset Management)

## 12. History

เก็บประวัติทุกขั้นตอน:
```
Import → Assign → Contact Vendor → CSR → Certificate Issued → Install → Verify → Complete
```
ตรวจสอบย้อนหลังได้ว่าใครทำอะไร เมื่อไร

## 13. Tech Stack

| ส่วน | Technology |
|---|---|
| Frontend | React + TypeScript + Vite |
| UI | ตาม Design System จาก legacy/report-jul69.html |
| Chart | Chart.js |
| Backend | Node.js + NestJS |
| Excel | ExcelJS |
| ORM | Prisma |
| Database | PostgreSQL |
| Authentication | JWT + RBAC |
| Scheduler | node-cron |
| Deploy | Docker Compose |

## 14. Architecture

```
Upload Excel
    ↓
Import Service → Validate Header → Header Mapping → Normalize Data
    ↓
Select Company
    ↓
Save PostgreSQL
    ↓
Certificate History → Renewal Workflow → Notification Service
    ↓
Dashboard → Graph / Report / Export
```

## เป้าหมายสุดท้าย

ไม่ใช่แค่ "Dashboard ดูวันหมดอายุ" แต่เป็นระบบบริหารวงจรชีวิต SSL Certificate ครบวงจร:
นำเข้าข้อมูล → จัดกลุ่มตามลูกค้า → ติดตามการต่ออายุ → แจ้งเตือน → เก็บประวัติ → ออกรายงาน
รองรับหลายบริษัทและขยายได้โดยไม่ต้องเปลี่ยนโครงสร้างหลัก

## ต้นแบบดีไซน์ Frontend

ดูไฟล์ `legacy/report-jul69.html` — Dashboard ใหม่ต้องคงโทนดีไซน์เดิม
(ฟอนต์ Sarabun, การ์ดสรุปความเสี่ยง 4 ระดับ, Doughnut/Bar chart, ตาราง badge, ปุ่มพิมพ์รายงาน)
รายละเอียดอยู่ในหัวข้อ Design System ของ CLAUDE.md

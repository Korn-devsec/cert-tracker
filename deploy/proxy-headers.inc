# header ที่ต้องส่งต่อให้ api ทุกครั้ง (แยกไฟล์ไว้เพื่อไม่ให้เขียนซ้ำในทุก location)
proxy_http_version 1.1;
proxy_set_header Host $host;
# api ตั้ง `trust proxy` ไว้ จึงอ่าน IP จริงของผู้ใช้จาก X-Forwarded-For (ตัวจำกัด login ใช้ค่านี้)
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header Connection "";

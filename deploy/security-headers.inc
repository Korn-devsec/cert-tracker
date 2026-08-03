# security header ของหน้าเว็บ
#
# ต้อง include ซ้ำในทุก location ที่มี `add_header` ของตัวเอง เพราะ nginx **ไม่สืบทอด**
# add_header จากระดับบนเมื่อ location นั้นประกาศ add_header เอง (เป็นกับดักคลาสสิกของ nginx)
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "SAMEORIGIN" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Cross-Origin-Opener-Policy "same-origin" always;
# ฟอนต์มาจาก Google Fonts · ไม่มีสคริปต์จากภายนอก (Chart.js ถูกรวมมาใน bundle แล้ว)
add_header Content-Security-Policy "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'" always;

// ใช้ defineConfig จาก vitest/config เพื่อให้ config ของ vite และ vitest อยู่ไฟล์เดียวกัน
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
  },
  test: {
    // jsdom เพื่อให้เทสต์ระดับ component (render หน้า Dashboard จริง) ทำงานได้
    // เทสต์ของฟังก์ชันล้วนก็รันบน jsdom ได้เหมือนกัน จึงใช้ค่าเดียวทั้งโปรเจกต์
    environment: 'jsdom',
    include: ['src/**/*.spec.{ts,tsx}'],
    restoreMocks: true,
  },
});

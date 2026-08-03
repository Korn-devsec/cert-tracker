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
    environment: 'node',
    include: ['src/**/*.spec.{ts,tsx}'],
  },
});

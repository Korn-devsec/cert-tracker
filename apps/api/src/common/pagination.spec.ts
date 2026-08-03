import { buildMeta, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, paginationArgs } from './pagination';

describe('paginationArgs', () => {
  it('ค่าเริ่มต้น: หน้า 1 ขนาด 25', () => {
    expect(paginationArgs({})).toEqual({
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
      skip: 0,
      take: DEFAULT_PAGE_SIZE,
    });
  });

  it('คำนวณ skip จากหน้าและขนาดหน้า', () => {
    expect(paginationArgs({ page: 4, pageSize: 10 })).toMatchObject({ skip: 30, take: 10 });
  });

  it('ขนาดหน้าเกินเพดาน → ตัดเหลือเพดาน (กันดึงทั้งฐานข้อมูลในคำขอเดียว)', () => {
    expect(paginationArgs({ pageSize: 10_000 }).take).toBe(MAX_PAGE_SIZE);
  });
});

describe('buildMeta', () => {
  const asOf = new Date('2026-08-03T10:00:00.000Z');

  it('คำนวณจำนวนหน้าแบบปัดขึ้น', () => {
    expect(buildMeta({ page: 1, pageSize: 25 }, 51, asOf)).toEqual({
      page: 1,
      pageSize: 25,
      total: 51,
      totalPages: 3,
      asOf: '2026-08-03T10:00:00.000Z',
    });
  });

  it('ไม่มีข้อมูล → totalPages = 0', () => {
    expect(buildMeta({ page: 1, pageSize: 25 }, 0, asOf).totalPages).toBe(0);
  });
});

import { normalizeEmployee } from './pay.js';
export function demoRows(companyId, secret) {
  const categories = ['Engineering · L3', 'Engineering · L4', 'Sales · L3', 'Operations · L3', 'Finance · L3', 'People · L3'];
  return Array.from({ length: 180 }, (_, index) => {
    const group = Math.floor(index / 30), female = index % 2 === 0;
    const base = 47000 + group * 4200 + (index % 7) * 1100;
    const factor = female ? [0.91, 0.97, 0.92, 1.01, 0.99, 0.97][group] : 1;
    return normalizeEmployee({ internal_id: `demo-${index}`, gender: female ? 'F' : 'M', job_title: categories[group].split(' · ')[0], worker_category: categories[group], base_annual: Math.round(base * factor), bonuses_annual: Math.round(2400 * factor), paid_hours_annual: 2080, hours_per_week: 40 }, companyId, secret);
  });
}

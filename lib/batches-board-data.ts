import "server-only";

import { buildBatchBoard, type BatchBoard, type BoardInputBatch } from "@/lib/batches-board";
import type { CourseManagementBatchRow } from "@/lib/course-management-data";
import { getOpsStory } from "@/lib/operations-story-data";

const num = (v: unknown) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

/** Programs & Batches board for managers and admins; null when demand can't be loaded (old page shows). */
export async function getBatchBoard(rows: CourseManagementBatchRow[]): Promise<BatchBoard | null> {
  const story = await getOpsStory(180);
  if (!story) return null;
  const warm: Record<string, { place: number; course: number }> = {};
  for (const b of story.batches) warm[b.id] = { place: b.warmPlace, course: b.warmCourse };
  const batches: BoardInputBatch[] = rows
    .filter((r) => r.effective_active === true && r.start_date)
    .map((r) => ({
      id: r.batch_id, courseId: r.course_id, course: r.course_name || r.course_code || "Course",
      location: r.location, mode: r.mode, start: String(r.start_date).slice(0, 10), end: r.end_date ? String(r.end_date).slice(0, 10) : null,
      capacity: num(r.capacity), seatsRemaining: num(r.published_seats_remaining), enrolled: num(r.enrolled_count) ?? 0,
      fee: num(r.expected_value), currency: r.currency, quotePrice: num(r.price_shared) ?? num(r.price_course_only) ?? num(r.price_private),
      open: r.enrollment_open !== false, note: r.enrollment_note,
    }));
  return buildBatchBoard({ today: story.today, batches, warm, noBatch: story.noBatch });
}

import { PgRlsRepository } from "../infrastructure/persistence/postgres/PgRlsRepository";

/**
 * Pure PostgreSQL Row-Level Security (RLS) Repositories.
 * All 16 tenant entities execute against the RLS-enforced PostgreSQL tables
 * (`app.current_tenant`) with zero MongoDB/Mongoose dependencies.
 */

export const Counter = new PgRlsRepository("tenant_sequences");
export const Attendance = new PgRlsRepository("attendance_records");
export const ClassRoom = new PgRlsRepository("class_sections");
export const Course = new PgRlsRepository("courses");
export const Department = new PgRlsRepository("departments");
export const Employee = new PgRlsRepository("staff");
export const Exam = new PgRlsRepository("exams");
export const ExamMark = new PgRlsRepository("exam_marks");
export const Expense = new PgRlsRepository("expenses");
export const Notice = new PgRlsRepository("notices");
export const Parent = new PgRlsRepository("guardians");
export const Payment = new PgRlsRepository("payments");
export const Routine = new PgRlsRepository("timetable_entries");
export const Student = new PgRlsRepository("students");
export const Teacher = new PgRlsRepository("staff");
export const User = new PgRlsRepository("tenant_memberships", {
  hashPasswordField: true,
});

export async function nextSequence(name: string): Promise<number> {
  const counter = await Counter.findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return counter?.seq || 1;
}

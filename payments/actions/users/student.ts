"use server";

import { db } from "@/lib/db";

export async function getStudentById(suffix: string) {
  // Search by last 8 characters of student ID
  const student = await db.student.findFirst({
    where: {
      id: {
        endsWith: suffix,
      },
    },
    include: {
      user: true,
      program: true,
      registrationNumber: true,
    },
  });

  if (!student) throw new Error("Student not found");
  return student;
}

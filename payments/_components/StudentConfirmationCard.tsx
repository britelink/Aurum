"use client";

import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Student } from "./StudentInfoCard";

interface StudentConfirmationCardProps {
  student: Student;
  onConfirm: () => void;
  onBack: () => void;
}

export default function StudentConfirmationCard({
  student,
  onConfirm,
  onBack,
}: StudentConfirmationCardProps) {
  return (
    <Card className="shadow-xl rounded-lg border border-gray-200">
      <CardHeader className="border-b border-blue-600 bg-blue-50 py-5 rounded-t-lg">
        <h2 className="text-3xl font-bold text-blue-900 text-center tracking-tight">
          Confirm Student Details
        </h2>
      </CardHeader>
      <CardContent className="space-y-6 pt-8">
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-500">
              Full Name
            </label>
            <div className="p-3 bg-gray-100 rounded-lg border border-gray-200 font-semibold text-gray-800">
              {student.user.name} {student.user.surname}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-500">
              Registration Number
            </label>
            <div className="p-3 bg-gray-100 rounded-lg border border-gray-200 font-semibold text-gray-800">
              {student.registrationNumber?.number || "N/A"}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-500">Program</label>
            <div className="p-3 bg-gray-100 rounded-lg border border-gray-200 font-semibold text-gray-800">
              {student.program.programName}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-500">Email</label>
            <div className="p-3 bg-gray-100 rounded-lg border border-gray-200 font-semibold text-gray-800">
              {student.user.email}
            </div>
          </div>
        </div>

        <div className="flex gap-4 mt-8">
          <Button
            onClick={onBack}
            variant="outline"
            className="flex-1 h-12 text-gray-600 hover:bg-gray-50 border-gray-300 rounded-xl transition-colors"
          >
            Back to Search
          </Button>
          <Button
            onClick={onConfirm}
            className="flex-1 h-12 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors font-semibold shadow-sm"
          >
            Confirm and Continue
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

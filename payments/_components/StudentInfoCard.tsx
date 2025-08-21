"use client";

import React, { useState } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Check, CheckCircle, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

// Define the form schema using Zod
const regSchema = z.object({
  registrationNumber: z
    .string()
    .min(1, "Registration number is required")
    .regex(
      /^[Rr]\d{6}[A-Za-z]$/,
      "Invalid registration number format (e.g. R188692X)"
    ),
});

// Infer the type from the schema
type FormValues = z.infer<typeof regSchema>;

// Define types for the student data structure
export interface User {
  name: string;
  surname: string;
  email: string;
}
export interface Student {
  id: string;
  user: User;
  program: Program;
  registrationNumber?: {
    number: string;
  };
}
export interface Program {
  programName: string;
}

interface ApiResponse {
  student: Student;
  error?: string;
}

interface StudentInfoCardProps {
  onStudentFound: (student: Student | null) => void;
  onBack: () => void;
}

export default function StudentInfoCard({
  onStudentFound,
  onBack,
}: StudentInfoCardProps) {
  const [student, setStudent] = useState<Student | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState("");

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<FormValues>({
    resolver: zodResolver(regSchema),
  });

  const searchStudent = async (data: FormValues) => {
    try {
      setIsSearching(true);
      setError("");

      const response = await fetch("/api/allstudents/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          registrationNumber: data.registrationNumber.toUpperCase(),
        }),
      });

      const result = (await response.json()) as ApiResponse;

      if (!response.ok) {
        throw new Error(result.error || "Failed to find student");
      }

      if (result.student) {
        setStudent(result.student);
        onStudentFound(result.student);
      } else {
        setError(
          `No student found with registration number ${data.registrationNumber}`
        );
        onStudentFound(null);
      }
    } catch (error) {
      if (error instanceof Error) {
        setError(error.message);
      } else {
        setError("An unknown error occurred");
      }
      onStudentFound(null);
    } finally {
      setIsSearching(false);
    }
  };

  const handleReset = () => {
    setStudent(null);
    setError("");
    reset();
    onStudentFound(null);
  };

  return (
    <Card className="shadow-lg">
      <CardHeader className="border-b-2 border-blue-100 pb-4">
        <h2 className="text-2xl font-semibold text-blue-800 text-center">
          Student Information
        </h2>
        {student && (
          <div className="flex items-center gap-4 p-4">
            <Button
              variant="link"
              onClick={handleReset}
              className="text-blue-600 hover:text-blue-800 flex-1 bg-blue-50 border-blue-200"
            >
              Select Different Student
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-6 pt-6">
        {student && (
          <div className="flex items-center gap-4 p-4">
            <Alert
              variant="success"
              className="bg-green-50 border-green-200 max-w-md mx-auto"
            >
              <CheckCircle className="h-5 w-5 text-green-600" />
              <AlertTitle className="text-green-800 font-semibold mb-1">
                Student Found!
              </AlertTitle>
              <AlertDescription className="text-green-700">
                Please review your details and proceed to add your payment
                method below.
              </AlertDescription>
            </Alert>
          </div>
        )}

        {error && (
          <Alert variant="destructive" className="bg-red-50 text-red-700">
            <AlertDescription>
              {error}
              <br />
              Please check your registration number and try again.
            </AlertDescription>
          </Alert>
        )}

        {!student && (
          <form onSubmit={handleSubmit(searchStudent)} className="space-y-6">
            <div className="md:col-span-2">
              <Label htmlFor="registrationNumber" className="text-gray-700">
                Registration Number
              </Label>
              <Input
                {...register("registrationNumber")}
                disabled={isSearching}
                className="mt-1 border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                placeholder="Enter registration number (e.g. R188692X)"
              />
              {errors.registrationNumber && (
                <p className="mt-1 text-sm text-red-600">
                  {errors.registrationNumber.message}
                </p>
              )}
            </div>

            <div className="md:col-span-2">
              <Button
                type="submit"
                disabled={isSearching}
                className="w-full bg-blue-600 hover:bg-blue-700"
              >
                {isSearching ? "Searching..." : "Find Student"}
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

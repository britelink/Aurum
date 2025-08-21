"use client";
import { useState, useCallback, useEffect } from "react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Toaster, toast } from "react-hot-toast";
import { Button } from "@/components/ui/button";

import StudentInfoCard from "./_components/StudentInfoCard";
import PaymentInfoCard from "./_components/PaymentInforCard";
import StudentConfirmationCard from "./_components/StudentConfirmationCard";

import { useRouter } from "next/navigation";
import {
  Currency,
  PaymentMethod,
  PaymentState,
  StoredPaymentStudent,
  Student,
} from "./actions/types";
import { PaymentService } from "./actions/service";
import { PaymentError, ValidationError } from "./actions/errors";

const INITIAL_STATE: PaymentState = {
  currentStep: 1,
  checkoutId: null,
  paymentAmount: 0,
  isProcessing: false,
  paymentBrand: "",
  studentData: null,
};

const paymentService = new PaymentService();

export default function PaymentPage() {
  const router = useRouter();
  const [state, setState] = useState<PaymentState>(INITIAL_STATE);

  const updateState = useCallback((updates: Partial<PaymentState>) => {
    setState((prev) => ({ ...prev, ...updates }));
  }, []);

  const resetState = useCallback(() => {
    setState(INITIAL_STATE);
    sessionStorage.removeItem("currentPaymentStudent");
  }, []);

  const handleStudentFound = useCallback(
    (student: Student | null) => {
      updateState({
        studentData: student,
        currentStep: student ? 2 : 1,
      });
    },
    [updateState]
  );

  const handleConfirmStudent = useCallback(() => {
    updateState({ currentStep: 3 });
  }, [updateState]);

  const handleBackToSearch = useCallback(() => {
    updateState({
      studentData: null,
      currentStep: 1,
    });
  }, [updateState]);

  const storeStudentData = useCallback((student: Student) => {
    const storedData: StoredPaymentStudent = {
      id: student.id,
      name: `${student.user.name} ${student.user.surname}`,
      regNumber: student.registrationNumber?.number || "N/A",
      program: student.program.programName,
      email: student.user.email,
    };
    sessionStorage.setItem("currentPaymentStudent", JSON.stringify(storedData));
  }, []);

  const handleProceedToPayment = useCallback(
    async (
      amount: number,
      currency: Currency,
      paymentMethod: PaymentMethod
    ) => {
      const { studentData } = state;
      if (!studentData) {
        toast.error("Student information missing");
        return;
      }

      try {
        updateState({ isProcessing: true });
        storeStudentData(studentData);

        const response = await paymentService.prepareCheckout({
          amount,
          currency,
          paymentMethod,
          studentId: studentData.id,
        });

        updateState({
          checkoutId: response.id,
          paymentAmount: amount,
          paymentBrand: response.paymentBrand,
          currentStep: 4,
        });

        // Load payment widget
        const script = document.createElement("script");
        script.src = `https://eu-test.oppwa.com/v1/paymentWidgets.js?checkoutId=${response.id}`;
        script.async = true;
        script.onerror = () => {
          toast.error(
            "Failed to load payment widget. Please refresh the page."
          );
        };
        document.body.appendChild(script);
      } catch (error) {
        let errorMessage = "Failed to initialize payment. Please try again.";

        if (error instanceof PaymentError) {
          errorMessage = error.message;
        } else if (error instanceof ValidationError) {
          errorMessage = `Invalid payment details: ${error.message}`;
        }

        toast.error(errorMessage);
        updateState({ currentStep: 3 });
      } finally {
        updateState({ isProcessing: false });
      }
    },
    [state, updateState, storeStudentData]
  );

  const handlePaymentComplete = useCallback(
    (success: boolean) => {
      if (success) {
        toast.success("Payment processed successfully!");
        resetState();
        router.refresh();
      } else {
        toast.error("Payment failed. Please try again.");
        updateState({ currentStep: 4 });
      }
    },
    [resetState, router]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      const paymentScript = document.querySelector(
        'script[src*="paymentWidgets.js"]'
      );
      if (paymentScript) {
        paymentScript.remove();
      }
    };
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <Toaster position="top-right" />

      <div className="max-w-3xl mx-auto text-center mb-12">
        <h1 className="text-4xl font-bold text-blue-800">
          {window.location.hostname.includes("missie")
            ? "Missie College"
            : "Harare Institute of Public Health"}
        </h1>
        <p className="text-lg text-gray-600 mt-3">
          Secure Payment Portal for Student Fees
        </p>
      </div>

      <div className="max-w-3xl mx-auto space-y-8">
        <StepIndicator currentStep={state.currentStep} />

        {state.currentStep === 1 && (
          <StudentInfoCard
            onStudentFound={handleStudentFound}
            onBack={handleBackToSearch}
          />
        )}

        {state.currentStep === 2 && state.studentData && (
          <StudentConfirmationCard
            student={state.studentData}
            onConfirm={handleConfirmStudent}
            onBack={handleBackToSearch}
          />
        )}

        {state.currentStep === 3 && (
          <PaymentInfoCard
            onProceedToPayment={handleProceedToPayment}
            isProcessing={state.isProcessing}
            onBack={() => updateState({ currentStep: 2 })}
          />
        )}

        {state.currentStep === 4 && state.checkoutId && (
          <PaymentWidget
            checkoutId={state.checkoutId}
            amount={state.paymentAmount}
            paymentBrand={state.paymentBrand}
            onBack={() => updateState({ currentStep: 3 })}
          />
        )}
      </div>
    </div>
  );
}

// Separate components for better organization
const StepIndicator = ({ currentStep }: { currentStep: number }) => (
  <div className="flex justify-center mb-8">
    <div className="steps-container flex gap-4">
      {[1, 2, 3, 4].map((step) => (
        <div key={step} className="step-item flex items-center gap-2">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center 
            ${currentStep >= step ? "bg-blue-600 text-white" : "bg-gray-300 text-gray-600"}`}
          >
            {step}
          </div>
          {step < 4 && <div className="w-12 h-1 bg-gray-300"></div>}
        </div>
      ))}
    </div>
  </div>
);

interface PaymentWidgetProps {
  checkoutId: string;
  amount: number;
  paymentBrand: string;
  onBack: () => void;
}

const PaymentWidget = ({
  checkoutId,
  amount,
  paymentBrand,
  onBack,
}: PaymentWidgetProps) => (
  <Card className="shadow-lg">
    <CardHeader>
      <h2 className="text-2xl font-semibold text-blue-800">Complete Payment</h2>
    </CardHeader>
    <CardContent>
      <div className="space-y-4">
        <div className="bg-blue-50 p-4 rounded-md">
          <p className="text-blue-800">Amount to pay: {amount.toFixed(2)}</p>
        </div>

        <form
          action="/payments/result"
          className="paymentWidgets"
          data-brands={paymentBrand}
        />

        <Button onClick={onBack} className="mt-4" variant="outline">
          Back to Payment Details
        </Button>
      </div>
    </CardContent>
  </Card>
);

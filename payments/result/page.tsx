"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { PaymentResult, PaymentResultState, StoredStudent } from "../actions/types";
import { PaymentService } from "../actions/service";
import { PaymentError } from "../actions/errors";
import { GATEWAY_ERRORS } from "../actions/utils/codes";


const INITIAL_STATE: PaymentResultState = {
  loading: true,
  success: false,
  transactionId: null,
  error: null,
  studentData: null,
  result: null
};

const paymentService = new PaymentService();

export default function PaymentResultPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [state, setState] = useState<PaymentResultState>(INITIAL_STATE);

  const updateState = useCallback((updates: Partial<PaymentResultState>) => {
    setState(prev => ({ ...prev, ...updates }));
  }, []);

  const retrieveStoredStudent = useCallback((): StoredStudent | null => {
    try {
      const storedData = sessionStorage.getItem('currentPaymentStudent');
      if (!storedData) return null;
      
      const parsedData = JSON.parse(storedData);
      sessionStorage.removeItem('currentPaymentStudent'); // Clean up
      return parsedData;
    } catch (error) {
      console.error('Failed to retrieve stored student data:', error);
      return null;
    }
  }, []);

  const handlePaymentVerification = useCallback(async () => {
    const resourcePath = searchParams.get("resourcePath");
    console.log('Starting payment verification', { resourcePath });
    
    try {
      const storedStudent = retrieveStoredStudent();
      console.debug('Retrieved stored student:', storedStudent);
      
      if (storedStudent) {
        updateState({ studentData: storedStudent });
        console.debug('Updated state with stored student');
      }

      if (!resourcePath) {
        console.error('Missing resourcePath parameter');
        throw new PaymentError("Missing payment reference");
      }

      console.log('Initiating payment status check');
      const result = await paymentService.checkPaymentStatus(resourcePath);
      console.debug('Payment status result:', result);
      
      if (result.success) {
        console.log('Payment successful', {
          transactionId: result.data?.merchantTransactionId,
          studentId: result.data?.studentId
        });
        
        updateState({
          success: true,
          transactionId: result.data?.merchantTransactionId || null,
          result: result
        });

        // If we don't have stored student data, try to fetch it
        if (!storedStudent && result.data?.studentId) {
          try {
            const studentResponse = await fetch(`/api/students/${result.data.studentId}`);
            const studentData = await studentResponse.json();
            
            updateState({
              studentData: {
                id: studentData.id,
                name: `${studentData.user?.name} ${studentData.user?.surname}`,
                regNumber: studentData.registrationNumber?.number || "N/A",
                program: studentData.program?.programName || "N/A",
                email: studentData.user?.email || "N/A",
              }
            });
          } catch (error) {
            console.error('Failed to fetch student details:', error);
          }
        }
      } else {
        console.warn('Payment failed', {
          errorCode: result.data?.result?.code,
          errorMessage: result.data?.result?.description || 'Payment verification failed'
        });
        
        const errorCode = result.data?.result?.code;
        const errorMessage = GATEWAY_ERRORS[errorCode] || 
                           result.data?.result?.description ||
                           'Payment verification failed';
                           
        updateState({
          error: errorMessage,
          result: result
        });
      }
    } catch (error) {
      console.error('Payment verification error:', error);
      let errorMessage = "An unexpected error occurred";
      
      if (error instanceof PaymentError) {
        errorMessage = error.message;
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }
      
      updateState({ error: errorMessage });
    } finally {
      updateState({ loading: false });
    }
  }, [searchParams, updateState, retrieveStoredStudent]);

  useEffect(() => {
    handlePaymentVerification();
  }, [handlePaymentVerification]);

  if (state.loading) {
    return <LoadingState />;
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
        {state.success ? (
          <SuccessState 
            transactionId={state.transactionId} 
          />
        ) : (
          <ErrorState 
            error={state.error}
            result={state.result}
          />
        )}
        
        {state.studentData && (
          <StudentDetails 
            student={state.studentData}
          />
        )}
      </div>
    </div>
  );
}

const LoadingState = () => (
  <div className="min-h-screen bg-gray-50 flex items-center justify-center">
    <div className="text-center space-y-4">
      <Loader2 className="h-12 w-12 text-blue-600 animate-spin mx-auto" />
      <h1 className="text-2xl font-semibold text-gray-800">
        Verifying Payment Status...
      </h1>
      <p className="text-gray-600">
        Please wait while we confirm your payment
      </p>
    </div>
  </div>
);

interface SuccessStateProps {
  transactionId: string | null;
}

const SuccessState = ({ transactionId }: SuccessStateProps) => (
  <div className="text-center space-y-6">
    <div className="text-green-600">
      <svg
        className="w-16 h-16 mx-auto"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M5 13l4 4L19 7"
        />
      </svg>
    </div>
    <h1 className="text-2xl font-semibold text-gray-800">
      Payment Successful!
    </h1>
    {transactionId && (
      <p className="text-gray-600">Transaction ID: {transactionId}</p>
    )}
    <Button asChild className="w-full mt-6">
      <Link href="/payments">Return to Payments</Link>
    </Button>
  </div>
);

interface ErrorStateProps {
  error: string | null;
  result: PaymentResult | null;
}

const ErrorState = ({ error, result }: ErrorStateProps) => (
  <div className="text-center space-y-6">
    <div className="text-red-600">
      <svg
        className="w-16 h-16 mx-auto"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M6 18L18 6M6 6l12 12"
        />
      </svg>
    </div>
    <h1 className="text-2xl font-semibold text-gray-800">
      Payment Failed
    </h1>
    {error && (
      <div className="text-left space-y-2">
        <p className="text-gray-600 font-medium">Error details:</p>
        <pre className="text-xs bg-gray-100 p-2 rounded-md overflow-x-auto">
          {error}
        </pre>
        {result?.data?.result?.code && (
          <p className="text-sm mt-2">
            Error code: {result.data.result.code}
          </p>
        )}
      </div>
    )}
    <div className="space-y-4">
      <Button asChild className="w-full">
        <Link href="/payments">Try Again</Link>
      </Button>
      <Button variant="outline" asChild className="w-full">
        <Link href="/">Return Home</Link>
      </Button>
    </div>
  </div>
);

interface StudentDetailsProps {
  student: StoredStudent;
}

const StudentDetails = ({ student }: StudentDetailsProps) => (
  <div className="border-t border-b border-gray-200 py-6 space-y-4">
    <div className="flex justify-between">
      <span className="text-gray-600">Student Name</span>
      <span className="text-gray-900 font-medium">{student.name}</span>
    </div>
    <div className="flex justify-between">
      <span className="text-gray-600">Registration Number</span>
      <span className="text-gray-900 font-medium">{student.regNumber}</span>
    </div>
    <div className="flex justify-between">
      <span className="text-gray-600">Program</span>
      <span className="text-gray-900 font-medium">{student.program}</span>
    </div>
    <div className="flex justify-between">
      <span className="text-gray-600">Email</span>
      <span className="text-gray-900 font-medium">{student.email}</span>
    </div>
  </div>
);
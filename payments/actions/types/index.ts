export type Currency = 'USD' | 'ZWG';

export type PaymentBrand = 'PRIVATE_LABEL' | 'VISA MASTER'   | 'ECOCASH';

export type TestMode = 'INTERNAL' | 'EXTERNAL';

export interface PaymentCredentials {
  entityId: string;
  paymentBrand: PaymentBrand;
  testMode: TestMode;
}

export interface PaymentConfig {
  authBearer: string;
  apiUrl: string;
}

export interface CheckoutRequest {
  amount: number;
  currency: Currency;
  paymentMethod: PaymentMethod;
  studentId: string;
}

export interface CheckoutResponse {
  id: string;
  ndc: string;
  timestamp: string;
  result: {
    code: string;
    description: string;
  };
  paymentBrand: PaymentBrand;
}

export interface PaymentStatusResponse {
  success: boolean;
  pending?: boolean;
  data?: any;
  error?: string;
  reason?: string;
}

export type PaymentMethod = 
  | 'zimswitch-usd'
  | 'zimswitch-zwg'
  | 'card-usd'
  | 'ecocash-usd'
  | 'ecocash-zwg';



export interface StudentUser {
  name: string;
  surname: string;
  email: string;
}

export interface StudentProgram {
  programName: string;
}

export interface StudentRegistration {
  number: string;
}

export interface Student {
  id: string;
  user: StudentUser;
  program: StudentProgram;
  registrationNumber?: StudentRegistration;
}

export interface PaymentState {
  currentStep: number;
  checkoutId: string | null;
  paymentAmount: number;
  isProcessing: boolean;
  paymentBrand: string;
  studentData: Student | null;
}

export interface StoredPaymentStudent {
  id: string;
  name: string;
  regNumber: string;
  program: string;
  email: string;
}
export interface PaymentResultState {
  loading: boolean;
  success: boolean;
  transactionId: string | null;
  error: string | null;
  studentData: StoredStudent | null;
  result: PaymentResult | null;
}

export interface StoredStudent {
  id: string;
  name: string;
  regNumber: string;
  program: string;
  email: string;
}

export interface PaymentResult {
  data?: {
    merchantTransactionId?: string;
    studentId?: string;
    result?: {
      code: string;
      description: string;
    };
  };
}

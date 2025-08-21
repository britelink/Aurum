
import { PaymentStatusResponse } from '../types';
import { SUCCESS_CODES, PENDING_CODES, ERROR_CODES } from './codes';

export function parsePaymentStatus(resultCode: string): PaymentStatusResponse {
  if (SUCCESS_CODES[resultCode]) {
    return { 
      success: true, 
      data: { description: SUCCESS_CODES[resultCode] }
    };
  }

  if (PENDING_CODES[resultCode]) {
    return { 
      success: false, 
      pending: true, 
      reason: PENDING_CODES[resultCode]
    };
  }

  return { 
    success: false, 
    error: ERROR_CODES[resultCode] || 'Unknown error occurred'
  };
}
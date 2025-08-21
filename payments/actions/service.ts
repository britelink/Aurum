import { revalidatePath } from 'next/cache';
import { 
  CheckoutRequest, 
  CheckoutResponse, 
  PaymentStatusResponse 
} from './types';
import { PAYMENT_CONFIG, PAYMENT_CREDENTIALS } from './constants';
import { PaymentError, ValidationError } from './errors';
import { validateCheckoutRequest } from './validators';
import { parsePaymentStatus } from './utils';
import { logger } from './logger';  // Implement proper logging
import type { LogPayload } from './logger';

export class PaymentService {
  private readonly config = PAYMENT_CONFIG;

  async prepareCheckout(request: CheckoutRequest): Promise<CheckoutResponse> {
    try {
      console.log('Preparing checkout request:', {
        amount: request.amount,
        currency: request.currency,
        paymentMethod: request.paymentMethod,
        studentId: request.studentId
      });

      validateCheckoutRequest(request);
      
      const credentials = PAYMENT_CREDENTIALS[request.paymentMethod];
      console.debug('Using payment credentials:', credentials);

      const params = new URLSearchParams({
        entityId: credentials.entityId,
        amount: request.amount.toFixed(2),
        currency: request.currency,
        paymentType: 'DB',
        testMode: credentials.testMode,
        merchantTransactionId: `${request.studentId}-${Date.now()}`,
      });

      console.debug('Sending payment request to:', `${this.config.apiUrl}/v1/checkouts`);
      const response = await fetch(`${this.config.apiUrl}/v1/checkouts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Bearer ${this.config.authBearer}`,
        },
        body: params.toString(),
      });

      const responseData = await response.json();
      console.debug('Payment gateway response:', responseData);

      if (!response.ok) {
        console.error('Payment gateway error:', {
          status: response.status,
          error: responseData
        });
        throw new PaymentError(
          `Payment initialization failed: ${responseData.result?.description || response.statusText}`,
          responseData.result?.code,
          response.status
        );
      }

      console.log('Checkout prepared successfully', { checkoutId: responseData.id });
      return {
        ...responseData,
        paymentBrand: credentials.paymentBrand,
      };
    } catch (error) {
      logger.error('Payment preparation failed:', error as LogPayload);
      if (error instanceof PaymentError || error instanceof ValidationError) {
        throw error;
      }
      throw new PaymentError('Failed to process payment request');
    }
  }

  async checkPaymentStatus(resourcePath: string): Promise<PaymentStatusResponse> {
    try {
      console.log('Starting payment status check', { resourcePath });
      logger.info('Checking payment status:', { resourcePath });
      
      const url = new URL(`${this.config.apiUrl}${resourcePath}`);
      console.debug('Constructed status check URL:', url.toString());
      
      const entityIds = Object.values(PAYMENT_CREDENTIALS).map(cred => cred.entityId);
      console.debug('Trying entity IDs:', entityIds);

      for (const entityId of entityIds) {
        url.searchParams.set('entityId', entityId);
        console.debug('Attempting status check with entity ID:', entityId);

        const response = await fetch(url.toString(), {
          headers: {
            Authorization: `Bearer ${this.config.authBearer}`,
          },
        });

        const data = await response.json();
        console.debug('Status check response:', data);

        if (response.ok) {
          const resultCode = data.result?.code;
          console.log('Payment status result code:', resultCode);
          
          const status = parsePaymentStatus(resultCode);
          console.debug('Parsed payment status:', status);
          
          if (status.success) {
            logger.info('Payment successful:', {
              transactionId: data.id,
              amount: data.amount,
              currency: data.currency,
              studentId: data.merchantTransactionId,
            });
            revalidatePath('/payments');
          } else if (status.pending) {
            logger.warn('Payment pending:', {
              transactionId: data.id,
              reason: status.reason,
            });
          } else {
            logger.error('Payment failed:', {
              transactionId: data.id,
              error: status.error,
            });
          }
          
          return status;
        }
        
        console.warn('Unsuccessful status check attempt', {
          entityId,
          status: response.status,
          response: data
        });
      }

      throw new PaymentError('No valid response received from payment provider');
    } catch (error) {
      console.error('Payment status check failed:', error);
      logger.error('Payment status check failed:', error as LogPayload);
      if (error instanceof PaymentError) {
        throw error;
      }
      throw new PaymentError('Failed to check payment status');
    }
  }
}

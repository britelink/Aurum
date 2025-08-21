export class PaymentError extends Error {
    constructor(
      message: string,
      public code?: string,
      public statusCode?: number
    ) {
      super(message);
      this.name = 'PaymentError';
    }
  }
  
  export class ValidationError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'ValidationError';
    }
  }
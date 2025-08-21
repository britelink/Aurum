import { logger } from "./logger";
import { PAYMENT_CONFIG, PAYMENT_CREDENTIALS } from "./constants";
import { CheckoutResponse, PaymentStatusResponse } from "./types";
import { CheckoutRequest } from "./types";
import { validateDepositRequest } from "./validators";
import { PaymentError, ValidationError } from "./errors";
import { parsePaymentStatus } from "./utils";

export class PaymentService {
  private readonly config = PAYMENT_CONFIG;

  async prepareDeposit(request: CheckoutRequest): Promise<CheckoutResponse> {
    try {
      logger.info("Preparing deposit request:", {
        amount: request.amount,
        currency: request.currency,
        paymentMethod: request.paymentMethod,
        userId: request.userId,
      });

      validateDepositRequest(request);

      const credentials = PAYMENT_CREDENTIALS[request.paymentMethod];

      const params = new URLSearchParams({
        entityId: credentials.entityId,
        amount: request.amount.toFixed(2),
        currency: request.currency,
        paymentType: "DB",
        testMode: credentials.testMode,
        merchantTransactionId: `${request.userId}-${Date.now()}`,
        "customer.email": request.email || "",
      });

      const response = await fetch(`${this.config.apiUrl}/v1/checkouts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Bearer ${this.config.authBearer}`,
        },
        body: params.toString(),
      });

      const responseData = await response.json();

      if (!response.ok) {
        throw new PaymentError(
          `Payment initialization failed: ${responseData.result?.description || response.statusText}`,
          responseData.result?.code,
          response.status,
        );
      }

      logger.info("Deposit checkout prepared successfully", {
        checkoutId: responseData.id,
      });
      return {
        ...responseData,
        paymentBrand: credentials.paymentBrand,
      };
    } catch (error) {
      logger.error("Payment preparation failed:", error);
      if (error instanceof PaymentError || error instanceof ValidationError) {
        throw error;
      }
      throw new PaymentError("Failed to process payment request");
    }
  }

  async prepareWithdrawal(request: CheckoutRequest): Promise<CheckoutResponse> {
    try {
      logger.info("Preparing withdrawal request:", {
        amount: request.amount,
        currency: request.currency,
        paymentMethod: request.paymentMethod,
        userId: request.userId,
      });

      validateDepositRequest(request); // Reuse same validation

      const credentials = PAYMENT_CREDENTIALS[request.paymentMethod];

      const params = new URLSearchParams({
        entityId: credentials.entityId,
        amount: request.amount.toFixed(2),
        currency: request.currency,
        paymentType: "PA", // PA for payout/withdrawal
        testMode: credentials.testMode,
        merchantTransactionId: `${request.userId}-${Date.now()}`,
      });

      const response = await fetch(`${this.config.apiUrl}/v1/checkouts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Bearer ${this.config.authBearer}`,
        },
        body: params.toString(),
      });

      const responseData = await response.json();

      if (!response.ok) {
        throw new PaymentError(
          `Withdrawal initialization failed: ${responseData.result?.description || response.statusText}`,
          responseData.result?.code,
          response.status,
        );
      }

      logger.info("Withdrawal checkout prepared successfully", {
        checkoutId: responseData.id,
      });

      return {
        ...responseData,
        paymentBrand: credentials.paymentBrand,
      };
    } catch (error) {
      logger.error("Withdrawal preparation failed:", error);
      if (error instanceof PaymentError || error instanceof ValidationError) {
        throw error;
      }
      throw new PaymentError("Failed to process withdrawal request");
    }
  }

  async checkPaymentStatus(
    resourcePath: string,
  ): Promise<PaymentStatusResponse> {
    try {
      logger.info("Checking payment status:", { resourcePath });

      const url = new URL(`${this.config.apiUrl}${resourcePath}`);
      const entityIds = Object.values(PAYMENT_CREDENTIALS).map(
        (cred) => cred.entityId,
      );

      for (const entityId of entityIds) {
        url.searchParams.set("entityId", entityId);

        const response = await fetch(url.toString(), {
          headers: {
            Authorization: `Bearer ${this.config.authBearer}`,
          },
        });

        const data = await response.json();

        if (response.ok) {
          const resultCode = data.result?.code;
          const status = parsePaymentStatus(resultCode);

          return {
            ...status,
            data,
          };
        }
      }

      throw new PaymentError(
        "No valid response received from payment provider",
      );
    } catch (error) {
      logger.error("Payment status check failed:", error);
      if (error instanceof PaymentError) {
        throw error;
      }
      throw new PaymentError("Failed to check payment status");
    }
  }
}

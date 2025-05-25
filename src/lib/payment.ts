import { Id } from "@/convex/_generated/dataModel";

interface IveriPaymentConfig {
  applicationId: string;
  endpoint: string;
  isTest: boolean;
}

const config: IveriPaymentConfig = {
  applicationId: "EC4C46B2-F20C-4F9F-8244-87AC153EEEE8",
  endpoint: "https://backoffice.iveri.co.zw",
  isTest: true,
};

export async function initializePayment({
  amount,
  userId,
  email,
}: {
  amount: number;
  userId: Id<"users">;
  email: string;
}) {
  const formData = new FormData();

  // Required fields
  formData.append("Lite_Merchant_ApplicationId", config.applicationId);
  formData.append("Lite_Order_Amount", (amount * 100).toString()); // Convert to cents
  formData.append(
    "Lite_Website_Successful_Url",
    `${window.location.origin}/api/payment/success`,
  );
  formData.append(
    "Lite_Website_Fail_Url",
    `${window.location.origin}/api/payment/fail`,
  );
  formData.append(
    "Lite_Website_TryLater_Url",
    `${window.location.origin}/api/payment/retry`,
  );
  formData.append(
    "Lite_Website_Error_Url",
    `${window.location.origin}/api/payment/error`,
  );
  formData.append("Ecom_BillTo_Online_Email", email);

  // Add product details
  formData.append("Lite_Order_LineItems_Product_1", "Game Credits");
  formData.append("Lite_Order_LineItems_Quantity_1", "1");
  formData.append("Lite_Order_LineItems_Amount_1", (amount * 100).toString());

  // Add user reference
  formData.append("Lite_Order_Reference", userId);

  return formData;
}

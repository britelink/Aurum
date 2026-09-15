import { redirect } from "next/navigation";

/** Retired — the manual EcoCash form is now the Withdraw tab of `/wallet`. */
export default function ManualWithdrawPage() {
  redirect("/wallet");
}

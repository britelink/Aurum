import { redirect } from "next/navigation";

/** Retired — withdrawals moved into `/wallet`, next to the balance they draw on. */
export default function WithdrawPage() {
  redirect("/wallet");
}

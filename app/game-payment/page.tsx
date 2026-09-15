import { redirect } from "next/navigation";

/**
 * Retired — the fiat deposit picker lived here.
 *
 * It offered card, Zimswitch and a hosted EcoCash widget, none of which ever
 * settled a live payment. Deposits are crypto now, and they live in `/wallet`
 * alongside the balance and the withdrawal they exist to enable.
 *
 * Left as a redirect rather than deleted because the link is in the wild: the
 * play page pointed here for months.
 */
export default function GamePaymentPage() {
  redirect("/wallet");
}

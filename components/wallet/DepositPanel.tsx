"use client";

/**
 * Deposit — a three-step wizard.
 *
 *   method → amount → review → (pay)
 *
 * Both routes end at the same place: a transfer of one exact, tagged amount
 * into the agent wallet, which the on-chain watcher matches and credits.
 * "Send crypto" has the player make that transfer; "Pay with EcoCash" has SGX
 * make it for them. There is no second crediting path, which is why a player
 * with no crypto at all can still fund a game.
 *
 * The exact amount is the whole mechanism, so the review step shows it before
 * anything is quoted and the pay step shows nothing louder than it. A player
 * who rounds that figure is the one case the backend cannot settle alone.
 */

import { useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Check, Copy, ExternalLink, Loader2, Wallet } from "lucide-react";
import QRCode from "react-qr-code";
import { toast } from "react-hot-toast";
import { cn } from "@/lib/utils";
import { BackLink, Choice, ReviewCard, ReviewRow, Steps } from "./Wizard";

type Route = "send" | "ecocash";
const STEPS = ["Method", "Amount", "Confirm"];

/** SGX takes 2% off the fiat, so delivering X costs X/(1-0.02) — not X×1.02. */
function fiatForCrypto(usdt: number): number {
  return Math.round((usdt / 0.98 + 0.005) * 100) / 100;
}

export default function DepositPanel() {
  const rail = useQuery(api.deposits.depositRailStatus);
  const open = useQuery(api.deposits.myOpenDeposit);
  const createDeposit = useMutation(api.deposits.createDeposit);
  const cancelDeposit = useMutation(api.deposits.cancelDeposit);
  const topUpWithEcocash = useAction(api.buyCrypto.topUpWithEcocash);

  const [step, setStep] = useState(0);
  const [route, setRoute] = useState<Route | null>(null);
  const [amount, setAmount] = useState("10");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [ecocashRef, setEcocashRef] = useState<{
    reference: string;
    fiatAmount: number;
    phone: string;
  } | null>(null);

  if (rail === undefined || open === undefined) return <PanelSpinner />;

  if (!rail.available) {
    return (
      <Notice tone="warn" title="Deposits are being set up">
        {rail.message ??
          "The agent wallet address is not configured on this deployment yet."}
      </Notice>
    );
  }

  // An EcoCash prompt is out; the player is on their phone, not this screen.
  if (ecocashRef) {
    return (
      <EcocashPending
        info={ecocashRef}
        onDone={() => {
          setEcocashRef(null);
          setStep(0);
          setRoute(null);
        }}
      />
    );
  }

  // Money is already in flight toward a quote — that outranks starting another.
  if (open) {
    return (
      <PendingDeposit
        deposit={open}
        onCancel={async () => {
          try {
            await cancelDeposit({ depositId: open.id });
            setStep(0);
            setRoute(null);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Could not cancel");
          }
        }}
      />
    );
  }

  const n = Number(amount) || 0;
  const amountValid = n >= rail.minDeposit && n <= rail.maxDeposit;
  const phoneValid = phone.replace(/\D/g, "").length >= 9;

  const confirm = async () => {
    setBusy(true);
    try {
      if (route === "ecocash") {
        const out = await topUpWithEcocash({ amount: n, payerPhone: phone });
        setEcocashRef({
          reference: out.referenceNumber,
          fiatAmount: out.fiatAmount,
          phone: out.payerPhone,
        });
      } else {
        await createDeposit({ amount: n, asset: "USDT" });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not start that deposit";
      toast.error(msg.split("\n").pop() ?? msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <Steps steps={STEPS} current={step} />

      {step === 0 && (
        <div className="space-y-3">
          <p className="text-sm text-slate-500">How do you want to add funds?</p>
          <Choice
            icon="₮"
            title="Send crypto"
            subtitle="You already hold USDT on BNB Chain"
            onClick={() => {
              setRoute("send");
              setStep(1);
            }}
          />
          <Choice
            icon="📱"
            title="Pay with EcoCash"
            subtitle="No crypto needed — we buy it for you"
            onClick={() => {
              setRoute("ecocash");
              setStep(1);
            }}
          />
        </div>
      )}

      {step === 1 && (
        <div className="space-y-5">
          <BackLink onClick={() => setStep(0)} />

          <div className="space-y-2">
            <Label htmlFor="deposit-amount">
              How much do you want credited?
            </Label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                $
              </span>
              <Input
                id="deposit-amount"
                type="number"
                inputMode="decimal"
                min={rail.minDeposit}
                max={rail.maxDeposit}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="pl-7 text-lg"
              />
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              {[5, 10, 25, 50].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setAmount(String(v))}
                  className="rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:border-slate-400 dark:border-gray-700 dark:text-slate-300"
                >
                  ${v}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-500">
              Between ${rail.minDeposit} and ${rail.maxDeposit}.
            </p>
          </div>

          {route === "ecocash" && (
            <div className="space-y-2">
              <Label htmlFor="onramp-phone">Your EcoCash number</Label>
              <Input
                id="onramp-phone"
                placeholder="0771234567"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
              <p className="text-xs text-slate-500">
                You approve the payment on this phone.
              </p>
            </div>
          )}

          <Button
            className="w-full"
            size="lg"
            disabled={!amountValid || (route === "ecocash" && !phoneValid)}
            onClick={() => setStep(2)}
          >
            Review
          </Button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-5">
          <BackLink onClick={() => setStep(1)} />

          <ReviewCard>
            {route === "ecocash" ? (
              <>
                <ReviewRow label="Pay from" value={phone} />
                <ReviewRow
                  label="You pay on EcoCash"
                  value={`$${fiatForCrypto(n).toFixed(2)}`}
                />
                <ReviewRow
                  label="Credited to your balance"
                  value={`$${n.toFixed(2)}`}
                  emphasis
                />
              </>
            ) : (
              <>
                <ReviewRow label="Network" value={rail.chain} />
                <ReviewRow label="Asset" value="USDT" />
                <ReviewRow
                  label="Deposit fee"
                  value={rail.feePercent === 0 ? "Free" : `${rail.feePercent}%`}
                />
                <ReviewRow
                  label="Credited to your balance"
                  value={`$${n.toFixed(2)}`}
                  emphasis
                />
              </>
            )}
            <ReviewRow
              label="Available after"
              value={`${rail.requiredConfirmations} confirmations, ~1–3 min`}
              muted
            />
          </ReviewCard>

          <Button
            className="w-full"
            size="lg"
            disabled={busy}
            onClick={confirm}
          >
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {route === "ecocash"
              ? `Send EcoCash prompt for $${fiatForCrypto(n).toFixed(2)}`
              : "Get my deposit address"}
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function EcocashPending(props: {
  info: { reference: string; fiatAmount: number; phone: string };
  onDone: () => void;
}) {
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-blue-300 bg-blue-50 p-4 dark:border-blue-700/50 dark:bg-blue-900/20">
        <p className="font-medium text-slate-900 dark:text-slate-100">
          Check your phone
        </p>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Approve the ${props.info.fiatAmount.toFixed(2)} EcoCash prompt on{" "}
          {props.info.phone}. Your balance updates by itself once it clears — you
          can close this page.
        </p>
      </div>
      <ReviewCard>
        <ReviewRow label="Reference" value={props.info.reference} />
      </ReviewCard>
      <Button variant="outline" className="w-full" onClick={props.onDone}>
        Done
      </Button>
    </div>
  );
}

type Deposit = NonNullable<
  ReturnType<typeof useQuery<typeof api.deposits.myOpenDeposit>>
>;

function PendingDeposit(props: {
  deposit: Deposit;
  onCancel: () => Promise<void>;
}) {
  const d = props.deposit;
  const detected = d.status === "detected";
  const underpaid = d.status === "underpaid";

  return (
    <div className="space-y-5">
      <div
        className={cn(
          "rounded-xl border p-4",
          detected
            ? "border-amber-300 bg-amber-50 dark:border-amber-700/50 dark:bg-amber-900/20"
            : underpaid
              ? "border-rose-300 bg-rose-50 dark:border-rose-700/50 dark:bg-rose-900/20"
              : "border-blue-300 bg-blue-50 dark:border-blue-700/50 dark:bg-blue-900/20",
        )}
      >
        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
          {detected
            ? `Transfer seen — ${d.confirmations}/${d.requiredConfirmations} confirmations`
            : underpaid
              ? `Short by ${(d.amountPayable - d.amountReceived).toFixed(4)} ${d.asset} — send the difference to finish`
              : "Waiting for your transfer"}
        </p>
        {detected && (
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
            Your balance updates by itself. You can close this page.
          </p>
        )}
      </div>

      {!detected && (
        <>
          <PayTarget deposit={d} />
          <CopyField
            label={`Send exactly this much ${d.asset}`}
            value={String(d.amountPayable)}
            mono
            big
            hint="The last decimals are how we know the money is yours. Send this figure exactly."
          />
          <CopyField
            label={`To this address · ${d.chain}`}
            value={d.depositAddress}
            mono
            href={d.depositAddressUrl ?? undefined}
          />
        </>
      )}

      {d.txHash && (
        <CopyField
          label="Transaction"
          value={d.txHash}
          mono
          href={d.txUrl ?? undefined}
        />
      )}

      <ReviewCard>
        <ReviewRow label="You asked for" value={`$${d.amountRequested}`} />
        <ReviewRow
          label="Received so far"
          value={`${d.amountReceived} ${d.asset}`}
        />
        <ReviewRow
          label="Quote expires"
          value={new Date(d.expiresAt).toLocaleTimeString()}
          muted
        />
      </ReviewCard>

      <p className="text-xs text-slate-500">
        Late money still counts — a transfer arriving after the quote expires is
        matched back to it for seven days.
      </p>

      {d.status === "awaiting_payment" && (
        <Button variant="outline" className="w-full" onClick={props.onCancel}>
          Cancel and start over
        </Button>
      )}
    </div>
  );
}

/**
 * Scan-to-pay, and the answer to "how does the engine know it was me?"
 *
 * It knows by the amount. Every player's deposit lands in the same wallet, so
 * the figure carries a five-decimal tag unique to this quote — the transfer of
 * exactly `20.06979 USDT` belongs to exactly one deposit and no other. Nothing
 * else about the transaction identifies the sender: they may pay from an
 * exchange, a custodial wallet, an address we have never seen.
 *
 * Which is why this is a QR and not a picture of an address. The link is
 * EIP-681, so a wallet scanning it fills in the token, the recipient **and the
 * exact amount**. Typing the amount by hand is the one step where the tag gets
 * rounded away — and a rounded tag is precisely the case the watcher cannot
 * resolve alone, because it can no longer tell two deposits apart.
 *
 * Rendered as inline SVG by `react-qr-code`: no image service, so the address
 * never leaves the page.
 */
function PayTarget({ deposit }: { deposit: Deposit }) {
  const d = deposit;

  /*
   * Amount in the token's base units. USDT and USDC are 18-decimal on BSC
   * (unlike their 6-decimal Ethereum counterparts), and this is built with
   * string maths rather than floats — 20.06979 * 1e18 in a double loses the
   * tail, which is the only part that identifies the payer.
   */
  const [whole, frac = ""] = String(d.amountPayable).split(".");
  const baseUnits = `${whole}${frac.padEnd(18, "0").slice(0, 18)}`.replace(
    /^0+(?=\d)/,
    "",
  );

  const payUri = d.tokenAddress
    ? `ethereum:${d.tokenAddress}@${d.chainId}/transfer?address=${d.depositAddress}&uint256=${baseUnits}`
    : d.depositAddress;

  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-slate-200 bg-white p-5 dark:border-gray-700 dark:bg-white">
      {/* White plate always: a QR inverted by dark mode will not scan. */}
      <QRCode value={payUri} size={168} level="M" />
      <p className="text-center text-xs text-slate-500">
        Scan with your wallet — the amount fills itself in
      </p>
      <a href={payUri} className="w-full">
        <Button variant="outline" className="w-full gap-2">
          <Wallet className="h-4 w-4" />
          Open in wallet app
        </Button>
      </a>
    </div>
  );
}

function CopyField(props: {
  label: string;
  value: string;
  mono?: boolean;
  big?: boolean;
  hint?: string;
  href?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-1.5">
      <Label>{props.label}</Label>
      <div className="flex items-stretch gap-2">
        <div
          className={cn(
            "flex-1 overflow-x-auto rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-gray-700 dark:bg-gray-800",
            props.mono && "font-mono",
            props.big ? "text-lg font-semibold" : "text-sm",
          )}
        >
          <span className="whitespace-nowrap">{props.value}</span>
        </div>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(props.value).then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1500);
            });
          }}
          className="flex w-11 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:text-slate-900 dark:border-gray-700 dark:hover:text-white"
          aria-label={`Copy ${props.label}`}
        >
          {copied ? (
            <Check className="h-4 w-4 text-emerald-600" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </button>
        {props.href && (
          <a
            href={props.href}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-11 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:text-slate-900 dark:border-gray-700 dark:hover:text-white"
            aria-label="View on BscScan"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        )}
      </div>
      {props.hint && <p className="text-xs text-slate-500">{props.hint}</p>}
    </div>
  );
}

export function PanelSpinner() {
  return (
    <div className="flex h-48 items-center justify-center">
      <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
    </div>
  );
}

export function Notice(props: {
  tone: "warn" | "info";
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border p-4",
        props.tone === "warn"
          ? "border-amber-300 bg-amber-50 dark:border-amber-700/50 dark:bg-amber-900/20"
          : "border-slate-200 bg-slate-50 dark:border-gray-700 dark:bg-gray-800/50",
      )}
    >
      <p className="font-medium text-slate-900 dark:text-slate-100">
        {props.title}
      </p>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
        {props.children}
      </p>
    </div>
  );
}

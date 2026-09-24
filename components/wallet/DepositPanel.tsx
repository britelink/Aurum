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

import { useEffect, useState } from "react";
import Link from "next/link";
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

export default function DepositPanel() {
  const rail = useQuery(api.deposits.depositRailStatus);
  const open = useQuery(api.deposits.myOpenDeposit);
  const createDeposit = useMutation(api.deposits.createDeposit);
  const cancelDeposit = useMutation(api.deposits.cancelDeposit);
  /*
   * EcoCash through SGX's on-ramp, not collected here.
   *
   * Penny holds no crypto float of its own, and that is the whole argument.
   * Collecting EcoCash directly lands USD in a merchant account and credits a
   * balance that no token backs — the player can then withdraw against USDT
   * somebody else deposited. Going through SGX inverts it: SGX takes the fiat,
   * SGX's treasury sends USDT to our deposit address, and the ordinary chain
   * watcher credits the player when it arrives. The balance is token-backed by
   * construction, because nothing is credited until the tokens are actually
   * here.
   *
   * This path was abandoned once before, when SGX's API asserted Pesepay was
   * open and SGX moved to ZB. That was a forked code path on their side, now
   * fixed — the API and their own UI share one provider selection.
   */
  const startEcocashDeposit = useAction(api.buyCrypto.topUpWithEcocash);
  const ecocashStatus = useAction(api.buyCrypto.ecocashTopUpStatus);

  /*
   * Ask once, on mount, whether the EcoCash route can actually complete.
   *
   * An action rather than a query, because the answer lives on SGX's
   * deployment. `null` means we have not heard yet and the option stays
   * enabled — a slow check should not hide a working route.
   */
  const [ecocashOpen, setEcocashOpen] = useState<{
    available: boolean;
    message: string | null;
  } | null>(null);
  useEffect(() => {
    let cancelled = false;
    void ecocashStatus({})
      .then((r) => {
        if (!cancelled) setEcocashOpen(r);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [ecocashStatus]);

  const [step, setStep] = useState(0);
  const [route, setRoute] = useState<Route | null>(null);
  const [amount, setAmount] = useState("10");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  /*
   * Shown inline on the confirm step, not only as a toast.
   *
   * When the EcoCash on-ramp refused, the toast came and went and the screen
   * did not move -- so it read as a dead button rather than a refusal, which is
   * the same failure mode the Google sign-in had. A step that cannot proceed
   * has to say why, where the reader is already looking.
   */
  const [failure, setFailure] = useState<string | null>(null);
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
    setFailure(null);
    try {
      if (route === "ecocash") {
        const out = await startEcocashDeposit({ amount: n, payerPhone: phone });
        setEcocashRef({
          reference: out.referenceNumber,
          // What they actually pay: the credit plus SGX's on-ramp fee. Showing
          // the credited figure here would understate the prompt they are about
          // to approve on their phone.
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
            subtitle={
              ecocashOpen && !ecocashOpen.available
                ? "Paused by the payment provider"
                : "No crypto needed — we buy it for you"
            }
            disabled={ecocashOpen ? !ecocashOpen.available : false}
            onClick={() => {
              setRoute("ecocash");
              setStep(1);
            }}
          />
          {ecocashOpen && !ecocashOpen.available && ecocashOpen.message && (
            <p className="text-xs text-slate-500">{ecocashOpen.message}</p>
          )}
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
                <ReviewRow label="You pay on EcoCash" value={`$${n.toFixed(2)}`} />
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
              value={
                route === "ecocash"
                  ? "You approve on your phone, then straight away"
                  : `${rail.requiredConfirmations} confirmations, ~1–3 min`
              }
              muted
            />
          </ReviewCard>

          {failure && (
            <div className="rounded-lg border border-rose-300 bg-rose-50 p-3 dark:border-rose-700/50 dark:bg-rose-900/20">
              <p className="text-sm text-rose-700 dark:text-rose-300">
                {failure}
              </p>
            </div>
          )}

          <Button
            className="w-full"
            size="lg"
            disabled={busy}
            onClick={confirm}
          >
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {route === "ecocash"
              ? `Send EcoCash prompt for $${n.toFixed(2)}`
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

/**
 * After the quote: pay, then wait.
 *
 * Two phases, because they answer different questions. Before the player has
 * sent anything they need the figure, the address and a way to scan. Once they
 * say they have paid, none of that matters and the only question is "did it
 * arrive?" — so the screen stops being instructions and becomes a status.
 *
 * "I have paid" changes nothing on the server. The watcher decides when money
 * has arrived; a button cannot. It is here because a player who has just sent
 * a transfer needs somewhere to go, and leaving them on an instruction screen
 * that looks identical to before they paid is how they end up sending twice.
 *
 * Both phases carry a way out. The deposit does not need this page open — it
 * is credited by a cron whether anyone is watching or not — and saying so is
 * what lets someone go back to the table instead of sitting here refreshing.
 */
function PendingDeposit(props: {
  deposit: Deposit;
  onCancel: () => Promise<void>;
}) {
  const d = props.deposit;
  const [claimed, setClaimed] = useState(false);

  const detected = d.status === "detected";
  const underpaid = d.status === "underpaid";
  // The chain has spoken, so the player's own claim is no longer the signal.
  const waiting = claimed || detected || underpaid;

  if (!waiting) {
    return (
      <div className="space-y-5">
        <div className="rounded-xl border border-blue-300 bg-blue-50 p-4 dark:border-blue-700/50 dark:bg-blue-900/20">
          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
            Send {d.amountPayable} {d.asset} to finish
          </p>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
            On {d.chain}. Any other network and the funds are lost.
          </p>
        </div>

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

        <Button className="w-full" size="lg" onClick={() => setClaimed(true)}>
          I have sent it
        </Button>

        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={props.onCancel}
            className="text-xs text-slate-500 underline-offset-2 hover:underline"
          >
            Cancel this deposit
          </button>
          <Link
            href="/play"
            className="text-xs text-slate-500 underline-offset-2 hover:underline"
          >
            Back to the table
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div
        className={cn(
          "rounded-xl border p-5 text-center",
          detected
            ? "border-amber-300 bg-amber-50 dark:border-amber-700/50 dark:bg-amber-900/20"
            : underpaid
              ? "border-rose-300 bg-rose-50 dark:border-rose-700/50 dark:bg-rose-900/20"
              : "border-slate-200 bg-slate-50 dark:border-gray-700 dark:bg-gray-800/50",
        )}
      >
        {!detected && !underpaid && (
          <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin text-slate-400" />
        )}
        <p className="font-medium text-slate-900 dark:text-slate-100">
          {detected
            ? `Found it — ${d.confirmations}/${d.requiredConfirmations} confirmations`
            : underpaid
              ? `Short by ${(d.amountPayable - d.amountReceived).toFixed(4)} ${d.asset}`
              : "Looking for your transfer"}
        </p>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          {detected
            ? "Almost there. Your balance updates the moment it confirms."
            : underpaid
              ? `Send the difference to the same address and it completes on its own.`
              : "We scan the chain every minute. It usually takes one to three minutes from the moment you send."}
        </p>
      </div>

      {detected && (
        <div className="h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-gray-800">
          <div
            className="h-full rounded-full bg-amber-500 transition-all duration-500"
            style={{
              width: `${Math.min(100, ((d.confirmations ?? 0) / d.requiredConfirmations) * 100)}%`,
            }}
          />
        </div>
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
        <ReviewRow label="Expecting" value={`${d.amountPayable} ${d.asset}`} />
        <ReviewRow
          label="Received so far"
          value={`${d.amountReceived} ${d.asset}`}
        />
        <ReviewRow label="Will credit" value={`$${d.amountRequested}`} emphasis />
      </ReviewCard>

      <div className="rounded-xl border border-slate-200 p-4 dark:border-gray-700">
        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
          You do not have to wait here
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Your balance is credited automatically, even with this page closed. If
          nothing shows up, check you sent{" "}
          <span className="font-mono">{d.amountPayable}</span> — not a rounded
          figure — to{" "}
          <span className="font-mono">
            {d.depositAddress.slice(0, 10)}…{d.depositAddress.slice(-8)}
          </span>
          . Money sent late is still matched for seven days.
        </p>
        <Link href="/play">
          <Button variant="outline" className="mt-3 w-full">
            Back to the table
          </Button>
        </Link>
      </div>

      {!detected && (
        <button
          type="button"
          onClick={() => setClaimed(false)}
          className="mx-auto block text-xs text-slate-500 underline-offset-2 hover:underline"
        >
          Show the address and amount again
        </button>
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

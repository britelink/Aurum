"use client";

/**
 * Withdraw — a three-step wizard.
 *
 *   destination → details → review → (send)
 *
 * The EcoCash branch asks the network who owns the number and shows that name
 * back before anything is committed. The form used to ask the player to type
 * their own first and last name, which was theatre: Chessa runs its own
 * name-enquiry and overwrites whatever name we send, so a typed name could
 * never have caught a wrong digit. A name returned *by the network* can — a
 * mistyped number stops being invisible and becomes an unfamiliar name on the
 * confirmation screen.
 *
 * Nothing is debited until the final button. The idempotency key is minted once
 * per attempt and held in a ref, so a double-click returns the first payout
 * rather than opening a second.
 */

import { useEffect, useRef, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, ExternalLink, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "react-hot-toast";
import { cn } from "@/lib/utils";
import { PanelSpinner } from "./DepositPanel";
import { BackLink, Choice, ReviewCard, ReviewRow, Steps } from "./Wizard";

type Method = "crypto" | "ecocash";
const STEPS = ["Destination", "Details", "Confirm"];
/** Mirrors MIN_WITHDRAW_USD in convex/railLib.ts. */
const MIN_WITHDRAW = 0.5;

function newIdempotencyKey(): string {
  return `aurw-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export default function WithdrawPanel() {
  const me = useQuery(api.aurum.myBalance);
  const cryptoPayouts = useQuery(api.cryptoWithdrawals.myCryptoPayouts, { limit: 5 });
  const ecocashPayouts = useQuery(api.withdrawals.getMyPayouts, { limit: 5 });

  const requestCrypto = useMutation(api.cryptoWithdrawals.requestCryptoWithdrawal);
  const requestEcocash = useMutation(api.withdrawals.requestEcocashWithdrawal);
  const validateRecipient = useAction(api.chessaBridge.validateEcocashRecipient);

  const [step, setStep] = useState(0);
  const [method, setMethod] = useState<Method | null>(null);
  const [amount, setAmount] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);

  const [checking, setChecking] = useState(false);
  const [verified, setVerified] = useState<{ name: string; phone: string } | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);

  const keyRef = useRef<string>(newIdempotencyKey());

  const parsed = Number(amount);
  const quote = useQuery(api.cryptoWithdrawals.quoteWithdrawal, {
    amount: Number.isFinite(parsed) && parsed > 0 ? parsed : 0,
  });
  const balance = me?.balance ?? 0;

  useEffect(() => {
    if (me?.payoutAddress && !address) setAddress(me.payoutAddress);
    if (me?.payoutPhone && !phone) setPhone(me.payoutPhone);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.payoutAddress, me?.payoutPhone]);

  // A changed number invalidates the name checked against the old one.
  useEffect(() => {
    setVerified(null);
    setCheckError(null);
  }, [phone]);

  if (me === undefined) return <PanelSpinner />;

  /*
   * Nothing to withdraw is a state, not a form.
   *
   * Offering a destination picker, an amount field and a name check to someone
   * with $0 asks them to fill in three steps that cannot end in a payout. Say
   * so at the top and point at the only action that changes it.
   *
   * The history stays visible: a player whose last payout failed arrives here
   * to find out what happened to it, and hiding that behind an empty state is
   * exactly the wrong moment to go quiet.
   */
  if (balance < MIN_WITHDRAW) {
    return (
      <div className="space-y-5">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-center dark:border-gray-700 dark:bg-gray-800/50">
          <p className="font-medium text-slate-900 dark:text-slate-100">
            Nothing to withdraw yet
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {balance > 0
              ? `You have $${balance.toFixed(2)}. The minimum withdrawal is $${MIN_WITHDRAW.toFixed(2)}.`
              : "Add funds and win a few rounds, then come back."}
          </p>
        </div>
        <PayoutHistory
          crypto={cryptoPayouts ?? []}
          ecocash={(ecocashPayouts ?? []).map((p) => ({
            id: p._id,
            status: p.status,
            netUsd: p.netUsd ?? p.amountUsd,
            who: p.recipientName ?? p.ecocashPhone,
            error: p.sgxError ?? null,
            createdAt: p.createdAt,
          }))}
        />
      </div>
    );
  }

  const overBalance = parsed > balance;
  /*
   * Chessa refuses an EcoCash payout under $2 *received*, and the refusal comes
   * back as a bare 400 after the debit. Checked here so the player is told the
   * number before they commit, not refunded with a request id afterwards.
   */
  const ecocashTooSmall =
    method === "ecocash" && quote?.valid === true && quote.ecocashOk === false;
  const amountOk = quote?.valid === true && !overBalance && !ecocashTooSmall;
  const addressOk = /^0x[a-fA-F0-9]{40}$/.test(address.trim());

  const check = async () => {
    setChecking(true);
    setCheckError(null);
    try {
      const res = await validateRecipient({ phone });
      if (res.validated && res.name) {
        setVerified({ name: res.name, phone: res.phone });
      } else {
        setCheckError(res.error ?? "That number could not be checked.");
      }
    } catch (e) {
      setCheckError(e instanceof Error ? e.message : "Could not check that number");
    } finally {
      setChecking(false);
    }
  };

  const send = async () => {
    if (!quote?.valid) return;
    setBusy(true);
    try {
      if (method === "crypto") {
        await requestCrypto({
          amount: parsed,
          toAddress: address.trim(),
          asset: "USDT",
          idempotencyKey: keyRef.current,
        });
        toast.success(`Sending ${quote.net.toFixed(2)} USDT`);
      } else {
        await requestEcocash({
          amount: parsed,
          // The number the network confirmed, not the raw input.
          ecocashPhone: verified?.phone ?? phone.trim(),
          recipientName: verified?.name,
          idempotencyKey: keyRef.current,
        });
        toast.success(`Sending $${quote.net.toFixed(2)} to ${verified?.name}`);
      }
      keyRef.current = newIdempotencyKey();
      setAmount("");
      setStep(0);
      setMethod(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Withdrawal failed";
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
          <p className="text-sm text-slate-500">Where should the money go?</p>
          <Choice
            icon="₮"
            title="Crypto"
            subtitle="USDT to your own wallet on BNB Chain"
            onClick={() => {
              setMethod("crypto");
              setStep(1);
            }}
          />
          <Choice
            icon="📱"
            title="EcoCash"
            subtitle={
              quote?.ecocashMinNet
                ? `Zimbabwe mobile money — from $${quote.ecocashMinNet.toFixed(2)}`
                : "Zimbabwe mobile money, via Chessa"
            }
            onClick={() => {
              setMethod("ecocash");
              setStep(1);
            }}
          />
          <p className="pt-1 text-xs text-slate-500">
            Balance ${balance.toFixed(2)}
          </p>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-5">
          <BackLink onClick={() => setStep(0)} />

          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <Label htmlFor="withdraw-amount">How much?</Label>
              <button
                type="button"
                onClick={() => setAmount(balance.toFixed(2))}
                className="text-xs text-slate-500 underline-offset-2 hover:underline"
              >
                All ${balance.toFixed(2)}
              </button>
            </div>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                $
              </span>
              <Input
                id="withdraw-amount"
                type="number"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className={cn("pl-7 text-lg", overBalance && "border-rose-400")}
              />
            </div>
            {overBalance && (
              <p className="text-xs text-rose-600">
                That is more than your balance.
              </p>
            )}
            {quote?.valid === false && quote.message && !overBalance && (
              <p className="text-xs text-slate-500">{quote.message}</p>
            )}
            {ecocashTooSmall && quote?.valid && (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                EcoCash pays out from ${quote.ecocashMinNet?.toFixed(2)} received.
                Withdraw at least ${quote.ecocashMinGross?.toFixed(2)}, or take
                this out as crypto — that has no minimum beyond $
                {MIN_WITHDRAW.toFixed(2)}.
              </p>
            )}
          </div>

          {method === "crypto" ? (
            <div className="space-y-2">
              <Label htmlFor="withdraw-address">Your BEP-20 address</Label>
              <Input
                id="withdraw-address"
                placeholder="0x…"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="font-mono text-sm"
              />
              <p className="text-xs text-slate-500">
                BNB Smart Chain only. An address on another network loses the
                funds — there is no recall.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="withdraw-phone">EcoCash number</Label>
              <div className="flex gap-2">
                <Input
                  id="withdraw-phone"
                  placeholder="0771234567"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={check}
                  disabled={checking || phone.replace(/\D/g, "").length < 9}
                >
                  {checking ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Check"
                  )}
                </Button>
              </div>

              {verified && (
                <div className="flex items-start gap-2 rounded-lg border border-emerald-300 bg-emerald-50 p-3 dark:border-emerald-700/50 dark:bg-emerald-900/20">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      {verified.name}
                    </p>
                    <p className="text-xs text-slate-600 dark:text-slate-300">
                      EcoCash confirmed this account. If that is not you, fix the
                      number.
                    </p>
                  </div>
                </div>
              )}
              {checkError && (
                <p className="text-xs text-rose-600">{checkError}</p>
              )}
              {!verified && !checkError && (
                <p className="text-xs text-slate-500">
                  We check the name on the account before sending anything.
                </p>
              )}
            </div>
          )}

          <Button
            className="w-full"
            size="lg"
            disabled={
              !amountOk || (method === "crypto" ? !addressOk : !verified)
            }
            onClick={() => setStep(2)}
          >
            Review
          </Button>
        </div>
      )}

      {step === 2 && quote?.valid && (
        <div className="space-y-5">
          <BackLink onClick={() => setStep(1)} />

          <ReviewCard>
            {method === "ecocash" && verified && (
              <ReviewRow label="Paying" value={verified.name} />
            )}
            <ReviewRow
              label="To"
              value={
                method === "crypto"
                  ? `${address.slice(0, 10)}…${address.slice(-6)}`
                  : (verified?.phone ?? phone)
              }
            />
            <ReviewRow label="Leaving your balance" value={`$${quote.gross.toFixed(2)}`} />
            <ReviewRow label="Fee" value={`$${quote.fee.toFixed(2)}`} />
            <ReviewRow
              label={method === "crypto" ? "You receive" : "They receive"}
              value={
                method === "crypto"
                  ? `${quote.net.toFixed(2)} USDT`
                  : `$${quote.net.toFixed(2)}`
              }
              emphasis
            />
            <ReviewRow
              label="Balance after"
              value={`$${(balance - quote.gross).toFixed(2)}`}
              muted
            />
          </ReviewCard>

          <Button className="w-full" size="lg" disabled={busy} onClick={send}>
            {busy ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="mr-2 h-4 w-4" />
            )}
            {method === "crypto"
              ? `Send ${quote.net.toFixed(2)} USDT`
              : `Send $${quote.net.toFixed(2)} to EcoCash`}
          </Button>
          <p className="text-center text-xs text-slate-500">
            This cannot be undone once it is on chain.
          </p>
        </div>
      )}

      <PayoutHistory
        crypto={cryptoPayouts ?? []}
        ecocash={(ecocashPayouts ?? []).map((p) => ({
          id: p._id,
          status: p.status,
          netUsd: p.netUsd ?? p.amountUsd,
          who: p.recipientName ?? p.ecocashPhone,
          error: p.sgxError ?? null,
          createdAt: p.createdAt,
        }))}
      />
    </div>
  );
}

function PayoutHistory(props: {
  crypto: Array<{
    id: string;
    status: string;
    amountToken: number;
    txHash: string | null;
    txUrl: string | null;
    error: string | null;
    createdAt: number;
  }>;
  ecocash: Array<{
    id: string;
    status: string;
    netUsd: number;
    who: string;
    error: string | null;
    createdAt: number;
  }>;
}) {
  const rows = [
    ...props.crypto.map((c) => ({
      key: c.id,
      when: c.createdAt,
      label: `${c.amountToken.toFixed(2)} USDT`,
      detail: c.txHash ? `${c.txHash.slice(0, 10)}…` : "queued",
      href: c.txUrl,
      status: c.status,
      error: c.error,
    })),
    ...props.ecocash.map((e) => ({
      key: e.id,
      when: e.createdAt,
      label: `$${e.netUsd.toFixed(2)} EcoCash`,
      detail: e.who,
      href: null as string | null,
      status: e.status,
      error: e.error,
    })),
  ]
    .sort((a, b) => b.when - a.when)
    .slice(0, 6);

  if (rows.length === 0) return null;

  return (
    <div className="space-y-2 border-t border-slate-200 pt-4 dark:border-gray-800">
      <p className="text-[11px] uppercase tracking-wide text-slate-400">
        Recent payouts
      </p>
      {rows.map((r) => (
        <div key={r.key} className="flex items-start justify-between gap-3 text-sm">
          <div className="min-w-0">
            <div className="font-medium text-slate-900 dark:text-slate-100">
              {r.label}
            </div>
            <div
              className={cn(
                "truncate text-xs",
                r.error ? "text-rose-600" : "text-slate-500",
              )}
              title={r.error ?? undefined}
            >
              {r.error ?? r.detail}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <StatusPill status={r.status} />
            {r.href && (
              <a
                href={r.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-slate-400 hover:text-slate-900 dark:hover:text-white"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const done = status === "sent" || status === "ecocash_paid";
  const bad = status === "failed";
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[11px] font-medium",
        done
          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
          : bad
            ? "bg-rose-500/15 text-rose-700 dark:text-rose-300"
            : "bg-slate-200 text-slate-600 dark:bg-gray-800 dark:text-slate-300",
      )}
    >
      {done ? "paid" : bad ? "failed" : status.replace(/_/g, " ")}
    </span>
  );
}

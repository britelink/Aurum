"use client";

/**
 * Withdraw — crypto to the player's own wallet, or EcoCash via the Chessa rail.
 *
 * Two destinations, one fee, quoted before the player commits: `quoteWithdrawal`
 * is a pure query calling the same `computeWithdrawFee` the mutation charges
 * with, so the figure on screen cannot drift from the figure taken.
 *
 * Both paths debit the balance in the mutation that queues them and refund it
 * on any terminal failure, so a payout that never left is never money the
 * player has lost track of. The idempotency key is minted once per attempt and
 * held in a ref: a double-click returns the first payout rather than opening a
 * second.
 */

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ExternalLink } from "lucide-react";
import { toast } from "react-hot-toast";
import { cn } from "@/lib/utils";
import { Notice, PanelSpinner, Row } from "./DepositPanel";

type Method = "crypto" | "ecocash";

function newIdempotencyKey(): string {
  return `aurw-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export default function WithdrawPanel() {
  const me = useQuery(api.aurum.myBalance);
  const cryptoPayouts = useQuery(api.cryptoWithdrawals.myCryptoPayouts, {
    limit: 5,
  });
  const ecocashPayouts = useQuery(api.withdrawals.getMyPayouts, { limit: 5 });

  const requestCrypto = useMutation(
    api.cryptoWithdrawals.requestCryptoWithdrawal,
  );
  const requestEcocash = useMutation(api.withdrawals.requestEcocashWithdrawal);

  const [method, setMethod] = useState<Method>("crypto");
  const [amount, setAmount] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [busy, setBusy] = useState(false);

  // Minted per attempt, not per render: a re-render must not produce a new key
  // and turn a retry into a second payout.
  const keyRef = useRef<string>(newIdempotencyKey());

  const parsed = Number(amount);
  const quote = useQuery(api.cryptoWithdrawals.quoteWithdrawal, {
    amount: Number.isFinite(parsed) && parsed > 0 ? parsed : 0,
  });

  const balance = me?.balance ?? 0;

  // Prefill from whatever the player used last, once their profile arrives.
  // An effect, not a memo: this sets state, and doing that during render is how
  // a "cheap" prefill turns into a render loop.
  useEffect(() => {
    if (me?.payoutAddress && !address) setAddress(me.payoutAddress);
    if (me?.payoutPhone && !phone) setPhone(me.payoutPhone);
    if (me?.name && !firstName) {
      const parts = me.name.trim().split(" ");
      setFirstName(parts[0] ?? "");
      setLastName(parts.slice(1).join(" "));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.payoutAddress, me?.payoutPhone, me?.name]);

  if (me === undefined) return <PanelSpinner />;

  const overBalance = parsed > balance;

  const submit = async () => {
    if (!quote?.valid) {
      toast.error(quote?.message ?? "Enter a valid amount");
      return;
    }
    if (overBalance) {
      toast.error("That is more than your balance");
      return;
    }
    setBusy(true);
    try {
      if (method === "crypto") {
        await requestCrypto({
          amount: parsed,
          toAddress: address.trim(),
          asset: "USDT",
          idempotencyKey: keyRef.current,
        });
        toast.success("Payout queued — it goes out within a minute");
      } else {
        await requestEcocash({
          amount: parsed,
          ecocashPhone: phone.trim(),
          firstName: firstName.trim() || "Player",
          lastName: lastName.trim() || "User",
          idempotencyKey: keyRef.current,
        });
        toast.success("Cash-out queued — EcoCash usually lands in a few minutes");
      }
      keyRef.current = newIdempotencyKey();
      setAmount("");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Withdrawal failed";
      toast.error(msg.split("\n").pop() ?? msg);
    } finally {
      setBusy(false);
    }
  };

  const canSubmit =
    !busy &&
    quote?.valid === true &&
    !overBalance &&
    (method === "crypto"
      ? /^0x[a-fA-F0-9]{40}$/.test(address.trim())
      : phone.trim().length >= 9);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2">
        <MethodTab
          active={method === "crypto"}
          onClick={() => setMethod("crypto")}
          title="Crypto"
          subtitle="USDT on BNB Chain"
        />
        <MethodTab
          active={method === "ecocash"}
          onClick={() => setMethod("ecocash")}
          title="EcoCash"
          subtitle="Zimbabwe, via Chessa"
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <Label htmlFor="withdraw-amount">Amount</Label>
          <button
            onClick={() => setAmount(balance.toFixed(2))}
            className="text-xs text-slate-500 underline-offset-2 hover:underline"
          >
            Balance ${balance.toFixed(2)} — use all
          </button>
        </div>
        <Input
          id="withdraw-amount"
          type="number"
          inputMode="decimal"
          placeholder="0.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className={cn(overBalance && "border-rose-400")}
        />
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
            BNB Smart Chain only. An address on another network loses the funds —
            there is no recall.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="withdraw-phone">EcoCash number</Label>
            <Input
              id="withdraw-phone"
              placeholder="0771234567"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="withdraw-first">First name</Label>
              <Input
                id="withdraw-first"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="withdraw-last">Last name</Label>
              <Input
                id="withdraw-last"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </div>
          </div>
          <p className="text-xs text-slate-500">
            The name must match the EcoCash account, or the payout is rejected
            and refunded.
          </p>
        </div>
      )}

      {quote?.valid && (
        <dl className="space-y-1.5 rounded-lg bg-slate-50 p-4 text-sm dark:bg-gray-800/50">
          <Row label="Withdrawing" value={`$${quote.gross.toFixed(2)}`} />
          <Row label="Fee" value={`$${quote.fee.toFixed(2)}`} />
          <Row
            label={method === "crypto" ? "You receive" : "Recipient gets"}
            value={
              method === "crypto"
                ? `${quote.net.toFixed(2)} USDT`
                : `$${quote.net.toFixed(2)}`
            }
            highlight
          />
        </dl>
      )}

      <Button
        onClick={submit}
        disabled={!canSubmit}
        className="w-full"
        size="lg"
      >
        {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {method === "crypto" ? "Send USDT" : "Cash out to EcoCash"}
      </Button>

      <PayoutHistory
        crypto={cryptoPayouts ?? []}
        ecocash={(ecocashPayouts ?? []).map((p) => ({
          id: p._id,
          status: p.status,
          amountUsd: p.amountUsd,
          netUsd: p.netUsd ?? p.amountUsd,
          phone: p.ecocashPhone,
          error: p.sgxError ?? null,
          createdAt: p.createdAt,
        }))}
      />
    </div>
  );
}

function MethodTab(props: {
  active: boolean;
  onClick: () => void;
  title: string;
  subtitle: string;
}) {
  return (
    <button
      onClick={props.onClick}
      className={cn(
        "rounded-lg border p-3 text-left transition-colors",
        props.active
          ? "border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-gray-900"
          : "border-slate-200 text-slate-600 hover:border-slate-300 dark:border-gray-700 dark:text-slate-300",
      )}
    >
      <div className="font-medium">{props.title}</div>
      <div
        className={cn(
          "text-xs",
          props.active ? "opacity-70" : "text-slate-400",
        )}
      >
        {props.subtitle}
      </div>
    </button>
  );
}

function PayoutHistory(props: {
  crypto: Array<{
    id: string;
    status: string;
    amountUsd: number;
    amountToken: number;
    txHash: string | null;
    txUrl: string | null;
    error: string | null;
    createdAt: number;
  }>;
  ecocash: Array<{
    id: string;
    status: string;
    amountUsd: number;
    netUsd: number;
    phone: string;
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
      detail: e.phone,
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
        <div
          key={r.key}
          className="flex items-center justify-between gap-3 text-sm"
        >
          <div className="min-w-0">
            <div className="font-medium text-slate-900 dark:text-slate-100">
              {r.label}
            </div>
            <div className="truncate text-xs text-slate-500">
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

export { Notice };

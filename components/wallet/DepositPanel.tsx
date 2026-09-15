"use client";

/**
 * Deposit — crypto only.
 *
 * The card/Zimswitch/EcoCash deposit widget this replaces never settled a live
 * payment, so the flow it implied (pick a provider, get redirected, come back
 * and hope) is gone. What is here is the only path that works: the rail quotes
 * an address and an **exact amount**, the player sends it, and the on-chain
 * watcher credits them.
 *
 * The exact amount is the whole mechanism and the screen says so, because a
 * player who rounds it is the one case the backend has to resolve by hand. Two
 * decimals of the figure are a tag that tells their transfer from everyone
 * else's into the same wallet — the rail forgives up to 20 cents of rounding,
 * but only while no other open quote sits in the same band.
 */

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Check, Copy, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "react-hot-toast";
import { cn } from "@/lib/utils";

export default function DepositPanel() {
  const rail = useQuery(api.deposits.depositRailStatus);
  const open = useQuery(api.deposits.myOpenDeposit);
  const createDeposit = useMutation(api.deposits.createDeposit);
  const cancelDeposit = useMutation(api.deposits.cancelDeposit);

  const [amount, setAmount] = useState("10");
  const [asset, setAsset] = useState("USDT");
  const [busy, setBusy] = useState(false);

  if (rail === undefined || open === undefined) {
    return <PanelSpinner />;
  }

  if (!rail.available) {
    return (
      <Notice tone="warn" title="Deposits are being set up">
        {rail.message ??
          "The agent wallet address is not configured on this deployment yet."}
      </Notice>
    );
  }

  if (open) {
    return (
      <PendingDeposit
        deposit={open}
        onCancel={async () => {
          try {
            await cancelDeposit({ depositId: open.id });
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Could not cancel");
          }
        }}
      />
    );
  }

  const submit = async () => {
    const n = Number(amount);
    if (!Number.isFinite(n) || n < rail.minDeposit) {
      toast.error(`Minimum deposit is ${rail.minDeposit} ${asset}`);
      return;
    }
    setBusy(true);
    try {
      await createDeposit({ amount: n, asset });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not start that deposit";
      toast.error(msg.split("\n").pop() ?? msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
        <div className="space-y-2">
          <Label htmlFor="deposit-amount">Amount to deposit</Label>
          <Input
            id="deposit-amount"
            type="number"
            inputMode="decimal"
            min={rail.minDeposit}
            max={rail.maxDeposit}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Asset</Label>
          <Select value={asset} onValueChange={setAsset}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {rail.assets.map((a) => (
                <SelectItem key={a} value={a}>
                  {a}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {[5, 10, 25, 50].map((v) => (
          <button
            key={v}
            onClick={() => setAmount(String(v))}
            className="rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:border-slate-300 dark:border-gray-700 dark:text-slate-300"
          >
            ${v}
          </button>
        ))}
      </div>

      <dl className="space-y-1.5 rounded-lg bg-slate-50 p-4 text-sm dark:bg-gray-800/50">
        <Row label="Network" value={rail.chain} />
        <Row
          label="Deposit fee"
          value={rail.feePercent === 0 ? "None" : `${rail.feePercent}%`}
          highlight={rail.feePercent === 0}
        />
        <Row
          label="Credited after"
          value={`${rail.requiredConfirmations} confirmations (~1–3 min)`}
        />
      </dl>

      <Button onClick={submit} disabled={busy} className="w-full" size="lg">
        {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Get deposit address
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
          "rounded-lg border p-4",
          detected
            ? "border-amber-300 bg-amber-50 dark:border-amber-700/50 dark:bg-amber-900/20"
            : underpaid
              ? "border-rose-300 bg-rose-50 dark:border-rose-700/50 dark:bg-rose-900/20"
              : "border-blue-300 bg-blue-50 dark:border-blue-700/50 dark:bg-blue-900/20",
        )}
      >
        <p className="text-sm font-medium">
          {detected
            ? `Transfer seen — ${d.confirmations}/${d.requiredConfirmations} confirmations`
            : underpaid
              ? `Short by ${(d.amountPayable - d.amountReceived).toFixed(4)} ${d.asset} — send the difference to finish`
              : `Send exactly ${d.amountPayable} ${d.asset} on ${d.chain}`}
        </p>
        {detected && (
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
            Your balance updates by itself. You can close this page.
          </p>
        )}
      </div>

      <CopyField
        label={`Exact amount (${d.asset})`}
        value={String(d.amountPayable)}
        mono
        hint="Send this figure exactly — the last decimals identify your deposit."
      />
      <CopyField
        label="Deposit address"
        value={d.depositAddress}
        mono
        href={d.depositAddressUrl ?? undefined}
      />

      {d.txHash && (
        <CopyField
          label="Transaction"
          value={d.txHash}
          mono
          href={d.txUrl ?? undefined}
        />
      )}

      <dl className="space-y-1.5 rounded-lg bg-slate-50 p-4 text-sm dark:bg-gray-800/50">
        <Row label="You asked for" value={`${d.amountRequested} ${d.asset}`} />
        <Row
          label="Received so far"
          value={`${d.amountReceived} ${d.asset}`}
        />
        <Row
          label="Quote expires"
          value={new Date(d.expiresAt).toLocaleTimeString()}
        />
      </dl>

      <p className="text-xs text-slate-500">
        A late transfer still counts: money that arrives after the quote expires
        is matched back to it for seven days.
      </p>

      {d.status === "awaiting_payment" && (
        <Button variant="outline" className="w-full" onClick={props.onCancel}>
          Cancel and start over
        </Button>
      )}
    </div>
  );
}

function CopyField(props: {
  label: string;
  value: string;
  mono?: boolean;
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
            "flex-1 overflow-x-auto rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-800",
            props.mono && "font-mono",
          )}
        >
          <span className="whitespace-nowrap">{props.value}</span>
        </div>
        <button
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

export function Row(props: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-slate-500">{props.label}</dt>
      <dd
        className={cn(
          "text-right font-medium",
          props.highlight
            ? "text-emerald-600 dark:text-emerald-400"
            : "text-slate-900 dark:text-slate-100",
        )}
      >
        {props.value}
      </dd>
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
        "rounded-lg border p-4",
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

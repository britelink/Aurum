"use client";

/**
 * The shell both money flows run inside.
 *
 * Deposit and withdraw used to be one long form each: every field, every
 * method, every warning on screen at once, and no signal about which parts
 * applied to the choice you had made. On a page that moves real money that is
 * the wrong shape — the reader cannot tell what they are committing to until
 * they have already scrolled past it.
 *
 * One decision per step, a visible position in the sequence, and a review
 * before anything is committed. The review step exists because it is the only
 * place a wrong digit can still be caught for free.
 */

import { ArrowLeft, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export function Steps({
  steps,
  current,
}: {
  steps: string[];
  current: number;
}) {
  return (
    <ol className="flex items-center gap-1.5">
      {steps.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={label} className="flex flex-1 items-center gap-1.5">
            <div
              className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold transition-colors",
                done
                  ? "bg-emerald-500 text-white"
                  : active
                    ? "bg-slate-900 text-white dark:bg-white dark:text-gray-900"
                    : "bg-slate-200 text-slate-500 dark:bg-gray-800 dark:text-slate-400",
              )}
            >
              {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </div>
            <span
              className={cn(
                "hidden truncate text-xs sm:block",
                active
                  ? "font-medium text-slate-900 dark:text-white"
                  : "text-slate-400",
              )}
            >
              {label}
            </span>
            {i < steps.length - 1 && (
              <div
                className={cn(
                  "h-px flex-1",
                  done ? "bg-emerald-500" : "bg-slate-200 dark:bg-gray-800",
                )}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** A big, obvious choice. Two or three of these are a step. */
export function Choice({
  active,
  onClick,
  title,
  subtitle,
  icon,
  disabled,
}: {
  active?: boolean;
  onClick: () => void;
  title: string;
  subtitle: string;
  icon?: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl border p-4 text-left transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-40",
        active
          ? "border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-gray-900"
          : "border-slate-200 hover:border-slate-400 dark:border-gray-700 dark:hover:border-gray-500",
      )}
    >
      {icon && <span className="shrink-0 text-xl">{icon}</span>}
      <span className="min-w-0">
        <span className="block font-medium">{title}</span>
        <span
          className={cn(
            "block text-xs",
            active ? "opacity-70" : "text-slate-500",
          )}
        >
          {subtitle}
        </span>
      </span>
    </button>
  );
}

export function BackLink({ onClick, label = "Back" }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 dark:hover:text-white"
    >
      <ArrowLeft className="h-4 w-4" />
      {label}
    </button>
  );
}

/**
 * The review line-items.
 *
 * `emphasis` marks the number the reader is actually deciding on — what they
 * pay, or what the recipient gets. Everything else on a review screen is
 * supporting detail, and rendering it all at the same weight is how people
 * confirm a figure they never read.
 */
export function ReviewRow({
  label,
  value,
  emphasis,
  muted,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="text-sm text-slate-500">{label}</span>
      <span
        className={cn(
          "text-right",
          emphasis
            ? "text-lg font-semibold tabular-nums text-slate-900 dark:text-white"
            : muted
              ? "text-sm text-slate-500"
              : "text-sm font-medium tabular-nums text-slate-900 dark:text-slate-100",
        )}
      >
        {value}
      </span>
    </div>
  );
}

export function ReviewCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-slate-50 px-4 dark:divide-gray-800 dark:border-gray-700 dark:bg-gray-800/50">
      {children}
    </div>
  );
}

"use client";

import { useState } from "react";
import { RATES, calcMonthlyTotal } from "@/lib/cost";
import { ko } from "@/content/ko";

export function CostCalculator() {
  const [selected, setSelected] = useState<string[]>(
    RATES.filter((rate) => rate.defaultOn).map((rate) => rate.key),
  );

  function toggle(key: string) {
    setSelected((current) =>
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key],
    );
  }

  const total = calcMonthlyTotal(selected);

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50 text-left text-xs text-muted-foreground">
              <th className="px-4 py-2.5 font-medium" />
              <th className="px-4 py-2.5 font-medium">{ko.cost.tableService}</th>
              <th className="px-4 py-2.5 font-medium">{ko.cost.tablePlan}</th>
              <th className="px-4 py-2.5 font-medium">{ko.cost.tablePrice}</th>
              <th className="px-4 py-2.5 font-medium">{ko.cost.tableNote}</th>
            </tr>
          </thead>
          <tbody>
            {RATES.map((rate) => (
              <tr
                key={rate.key}
                className="border-b border-border last:border-b-0"
              >
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    className="size-4"
                    checked={selected.includes(rate.key)}
                    onChange={() => toggle(rate.key)}
                    aria-label={`${rate.service} ${rate.plan}`}
                  />
                </td>
                <td className="px-4 py-3 font-medium">{rate.service}</td>
                <td className="px-4 py-3">{rate.plan}</td>
                <td className="px-4 py-3">
                  {rate.monthlyUsd > 0
                    ? ko.cost.perMonth(rate.monthlyUsd)
                    : rate.yearlyKrw > 0
                      ? ko.cost.perYearKrw(rate.yearlyKrw)
                      : ko.cost.freeLabel}
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {rate.note}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-lg border border-primary/40 bg-accent px-5 py-4">
        <p className="text-sm font-medium text-muted-foreground">
          {ko.cost.totalTitle}
        </p>
        <p className="mt-1 text-lg font-bold">
          {ko.cost.totalMonthly(total.monthlyUsd, total.monthlyKrwApprox)}
        </p>
      </div>
    </div>
  );
}

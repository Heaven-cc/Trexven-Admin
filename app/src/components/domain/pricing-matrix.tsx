"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { PLANS, COUNTRIES, type CountryCode, type PlanKey, type PriceRow, type PricingData } from "@/lib/data/types";
import { currencyDigits, formatMoney, formatDate, moneyInputFromMinor, parseMoneyInput } from "@/lib/utils/format";

type PriceSelection = { country: CountryCode; plan: PlanKey; row?: PriceRow };

/** Saved drafts are not published prices and do not activate purchases. */
export function PricingMatrix({ pricing, canEdit }: { pricing: PricingData; canEdit: boolean }) {
  const [edit, setEdit] = React.useState<PriceSelection | null>(null);
  const countries = Object.keys(COUNTRIES) as CountryCode[];
  const plans = Object.keys(PLANS) as PlanKey[];
  return <>
    <div className="mb-4 rounded-lg border border-border bg-surface-muted p-4">
      <p className="text-sm font-semibold">Prepare subscription prices</p>
      <p className="mt-1 text-sm text-muted-foreground">Save a price draft for each market and plan. Drafts do not change customer prices or enable checkout. Publication and billing-period setup are not connected yet.</p>
    </div>
    <div className="overflow-x-auto rounded-lg border border-border bg-surface">
      <Table>
        <TableHeader><TableRow><TableHead>Market</TableHead>
          {plans.map(plan => <TableHead key={plan}>{PLANS[plan].name}</TableHead>)}
        </TableRow></TableHeader>
        <TableBody>{countries.map(country => <TableRow key={country}>
          <TableCell className="align-top font-medium">{COUNTRIES[country].name}</TableCell>
          {plans.map(plan => {
            const versions = pricing.rows.filter(r => r.countryCode === country && r.planKey === plan).sort((a, b) => b.version - a.version);
            const active = versions.find(r => r.active);
            const draft = versions.find(r => !r.active);
            return <TableCell key={plan} className="min-w-48 align-top"><div className="space-y-3">
              <div><p className="text-xs text-muted-foreground">Active price</p>
                <p className="mt-1 text-sm font-semibold tabular-nums">{active ? formatMoney(active.amountMinor, active.currency) : "Not configured"}</p>
                {active && <p className="mt-1 text-xs text-muted-foreground">Version {active.version} · from {formatDate(active.effectiveFrom)}</p>}
              </div>
              {draft && <div className="rounded-md bg-surface-muted p-2.5">
                <Badge tone="neutral">Inactive / draft · version {draft.version}</Badge>
                <p className="mt-2 font-medium tabular-nums">{formatMoney(draft.amountMinor, draft.currency)}</p>
                <p className="mt-1 text-xs text-muted-foreground">Proposed date: {formatDate(draft.effectiveFrom)}</p>
              </div>}
              {canEdit ? <Button variant="outline" size="sm"
                aria-label={`Create ${COUNTRIES[country].name} ${PLANS[plan].name} price draft`}
                onClick={() => setEdit({ country, plan, row: draft ?? active })}>
                {draft || active ? <Pencil className="mr-2 h-3.5 w-3.5" /> : <Plus className="mr-2 h-3.5 w-3.5" />}
                {draft || active ? "New draft version" : "Create price draft"}
              </Button> : <Badge tone="neutral">Read only</Badge>}
            </div></TableCell>;
          })}
        </TableRow>)}</TableBody>
      </Table>
    </div>
    {pricing.rows.length > 0 && <details className="mt-4 rounded-lg border border-border bg-surface p-4">
      <summary className="cursor-pointer text-sm font-medium">Price version history</summary>
      <div className="mt-3 overflow-x-auto"><Table>
        <TableHeader><TableRow>{["Market / plan", "Version", "Amount", "State", "Effective date"].map(label => <TableHead key={label}>{label}</TableHead>)}</TableRow></TableHeader>
        <TableBody>{[...pricing.rows].sort((a, b) => b.version - a.version).map(row => <TableRow key={row.id}>
          <TableCell>{COUNTRIES[row.countryCode].name}<p className="text-xs text-muted-foreground">{PLANS[row.planKey].name}</p></TableCell>
          <TableCell>{row.version}</TableCell><TableCell className="tabular-nums">{formatMoney(row.amountMinor, row.currency)}</TableCell>
          <TableCell><Badge tone={row.active ? "success" : "neutral"}>{row.active ? "Active" : "Inactive / draft"}</Badge></TableCell>
          <TableCell>{formatDate(row.effectiveFrom)}</TableCell>
        </TableRow>)}</TableBody>
      </Table></div>
    </details>}
    {edit && <PricingDraftDialog selection={edit} onClose={() => setEdit(null)} />}
  </>;
}

function PricingDraftDialog({ selection: { country, plan, row }, onClose }: { selection: PriceSelection; onClose: () => void }) {
  const router = useRouter();
  const { toast } = useToast();
  // Existing server billing-market configuration; never used as a business trading currency.
  const currency = COUNTRIES[country].currency;
  const digits = currencyDigits(currency);
  const [amount, setAmount] = React.useState(row && row.currency === currency ? moneyInputFromMinor(row.amountMinor, currency) : "");
  const today = new Date().toISOString().slice(0, 10);
  const [effective, setEffective] = React.useState(today);
  const [busy, setBusy] = React.useState(false);
  const [uncertain, setUncertain] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const minor = parseMoneyInput(amount, currency);
  const parsedDate = new Date(`${effective}T00:00:00Z`);
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(effective) && Number.isFinite(parsedDate.getTime())
    && parsedDate.toISOString().slice(0, 10) === effective && effective >= today;

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy || uncertain || minor === null || !validDate) return;
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/v1/pricing/draft", {
        method: "POST", headers: { "Content-Type": "application/json", "X-Admin-Request": "1" },
        body: JSON.stringify({ country, plan, minor, effective }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        if (response.status >= 500) throw new Error("Unconfirmed result");
        setError(response.status === 401 ? "Your session expired. Sign in again."
          : response.status === 403 ? "Your account cannot change pricing."
          : response.status === 409 ? "The draft was rejected. Check the effective date and refresh pricing."
          : "The draft could not be saved. Check the amount and date.");
        return;
      }
      if (typeof body?.data?.id !== "string" || !body.data.id) throw new Error("Missing receipt");
      toast("success", "Price draft saved", "Customer prices are unchanged. Publication is not connected yet.");
      router.refresh(); onClose();
    } catch {
      setUncertain(true);
      setError("The save result could not be confirmed. Close this dialog and refresh price history before creating another draft.");
    } finally { setBusy(false); }
  }
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}><DialogContent>
    <DialogHeader><DialogTitle>Create price draft</DialogTitle>
      <DialogDescription>{COUNTRIES[country].name} · {PLANS[plan].name}</DialogDescription>
    </DialogHeader>
    <form onSubmit={save} className="space-y-5">
      <div className="rounded-md border border-border bg-surface-muted p-3 text-sm">
        <p className="font-medium">A draft does not change an active subscription.</p>
        <p className="mt-1 text-muted-foreground">The date below is proposed. Saving will not schedule publication or charge customers.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="price-amount" className="text-sm font-medium">Amount ({currency})</label>
          <Input id="price-amount" value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" disabled={busy || uncertain} aria-describedby="price-precision" aria-invalid={amount !== "" && minor === null} />
          <p id="price-precision" className="text-xs text-muted-foreground">{digits === 0 ? "Enter a whole amount." : `Use up to ${digits} decimal places.`} Zero is allowed for a free plan.</p>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="price-date" className="text-sm font-medium">Proposed effective date (UTC)</label>
          <Input id="price-date" type="date" min={today} value={effective} onChange={e => setEffective(e.target.value)} disabled={busy || uncertain} aria-invalid={!validDate} />
        </div>
      </div>
      {minor !== null && <p className="text-sm">Draft amount: <strong className="tabular-nums">{formatMoney(minor, currency)}</strong></p>}
      {error && <p role="alert" className="rounded-md bg-danger-soft p-3 text-sm text-danger">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" disabled={busy} onClick={onClose}>Close</Button>
        <Button type="submit" disabled={busy || uncertain || minor === null || !validDate}>{busy ? "Saving draft…" : "Save draft"}</Button>
      </div>
    </form>
  </DialogContent></Dialog>;
}

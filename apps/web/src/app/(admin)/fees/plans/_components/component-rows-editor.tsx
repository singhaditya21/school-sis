'use client';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { formatCurrency } from '@/lib/utils';
import { DEFAULT_FEE_FREQUENCY, FEE_FREQUENCY_OPTIONS } from './fee-frequency';

/**
 * One editable fee component row.
 * `id` is the persisted fee_components.id, or null for a row the user just
 * added. `key` is a client-only React key so re-ordering/removing never
 * re-uses another row's identity.
 */
export interface ComponentDraft {
    key: string;
    id: string | null;
    name: string;
    amount: string;
    frequency: string;
    isOptional: boolean;
}

let draftCounter = 0;

export function newComponentDraft(): ComponentDraft {
    draftCounter += 1;
    return {
        key: `draft-${draftCounter}-${Date.now()}`,
        id: null,
        name: '',
        amount: '',
        frequency: DEFAULT_FEE_FREQUENCY,
        isOptional: false,
    };
}

/** Rupee amounts, summed in paise so repeated 2-decimal values stay exact. */
export function sumComponents(rows: ComponentDraft[], optional: boolean): number {
    const paise = rows.reduce((total, row) => {
        if (row.isOptional !== optional) return total;
        const value = Number(row.amount);
        if (!Number.isFinite(value) || value <= 0) return total;
        return total + Math.round(value * 100);
    }, 0);
    return paise / 100;
}

export function ComponentRowsEditor({
    rows,
    onChange,
    disabled = false,
}: {
    rows: ComponentDraft[];
    onChange: (rows: ComponentDraft[]) => void;
    disabled?: boolean;
}) {
    const mandatoryTotal = sumComponents(rows, false);
    const optionalTotal = sumComponents(rows, true);
    const hasMandatory = rows.some((row) => !row.isOptional);

    function update(key: string, patch: Partial<ComponentDraft>) {
        onChange(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
    }

    function remove(key: string) {
        onChange(rows.filter((row) => row.key !== key));
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <h3 className="text-sm font-semibold">Fee components</h3>
                    <p className="text-xs text-muted-foreground">
                        Invoices are priced from mandatory components only. At least one is required.
                    </p>
                </div>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    data-testid="add-component"
                    disabled={disabled}
                    onClick={() => onChange([...rows, newComponentDraft()])}
                >
                    + Add component
                </Button>
            </div>

            {rows.length === 0 ? (
                <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                    No components yet. This plan cannot be invoiced until you add one.
                </p>
            ) : (
                <div className="space-y-3">
                    {rows.map((row, index) => (
                        <div
                            key={row.key}
                            className="grid gap-3 rounded-lg border p-3 sm:grid-cols-12 sm:items-end"
                        >
                            <div className="sm:col-span-4">
                                <Label htmlFor={`component-name-${index}`} className="text-xs">
                                    Component name
                                </Label>
                                <Input
                                    id={`component-name-${index}`}
                                    data-testid={`component-name-${index}`}
                                    value={row.name}
                                    disabled={disabled}
                                    maxLength={255}
                                    placeholder="e.g. Tuition Fee"
                                    onChange={(event) => update(row.key, { name: event.target.value })}
                                />
                            </div>

                            <div className="sm:col-span-3">
                                <Label htmlFor={`component-amount-${index}`} className="text-xs">
                                    Amount (₹)
                                </Label>
                                <Input
                                    id={`component-amount-${index}`}
                                    data-testid={`component-amount-${index}`}
                                    value={row.amount}
                                    disabled={disabled}
                                    inputMode="decimal"
                                    placeholder="15000"
                                    onChange={(event) => update(row.key, { amount: event.target.value })}
                                />
                            </div>

                            <div className="sm:col-span-3">
                                <Label className="text-xs">Frequency</Label>
                                <Select
                                    value={row.frequency}
                                    disabled={disabled}
                                    onValueChange={(value) => update(row.key, { frequency: value })}
                                >
                                    <SelectTrigger data-testid={`component-frequency-${index}`}>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {FEE_FREQUENCY_OPTIONS.map((option) => (
                                            <SelectItem key={option.value} value={option.value}>
                                                {option.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="flex items-center justify-between gap-3 sm:col-span-2">
                                <label className="flex items-center gap-2 text-xs">
                                    <Checkbox
                                        data-testid={`component-optional-${index}`}
                                        checked={row.isOptional}
                                        disabled={disabled}
                                        onCheckedChange={(checked) =>
                                            update(row.key, { isOptional: checked === true })
                                        }
                                    />
                                    Optional
                                </label>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    data-testid={`remove-component-${index}`}
                                    disabled={disabled}
                                    onClick={() => remove(row.key)}
                                >
                                    Remove
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/50 px-4 py-3 text-sm">
                <span className="text-muted-foreground">Billed per student (mandatory)</span>
                <span className="font-semibold tabular-nums" data-testid="mandatory-total">
                    {formatCurrency(mandatoryTotal)}
                </span>
            </div>
            {optionalTotal > 0 && (
                <p className="text-xs text-muted-foreground">
                    Optional components total {formatCurrency(optionalTotal)} and are not billed automatically.
                </p>
            )}
            {rows.length > 0 && !hasMandatory && (
                <p className="text-xs font-medium text-red-600 dark:text-red-400">
                    Every component is marked optional — invoices generated from this plan would total ₹0.
                </p>
            )}
        </div>
    );
}

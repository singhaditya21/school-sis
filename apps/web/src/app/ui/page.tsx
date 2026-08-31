"use client"

import * as React from "react"
import {
    Bell,
    CreditCard,
    GraduationCap,
    MoreHorizontal,
    Plus,
    Users,
} from "lucide-react"

// Client components import primitives directly (not via the barrel): a
// non-"use client" barrel re-exporting client components resolves them as
// promises when a client component consumes it.
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { FormField } from "@/components/ui/form-field"
import { Input } from "@/components/ui/input"
import { MetricCard } from "@/components/ui/metric-card"
import { PageHeader } from "@/components/ui/page-header"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import { EmptyState, LoadingState } from "@/components/ui/states"
import { StatusBadge } from "@/components/ui/status-badge"
import { Switch } from "@/components/ui/switch"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip"

// Static class strings (not interpolated) so Tailwind generates these utilities.
const TOKEN_SWATCHES: { name: string; cls: string }[] = [
    { name: "background", cls: "bg-background" },
    { name: "foreground", cls: "bg-foreground" },
    { name: "card", cls: "bg-card" },
    { name: "muted", cls: "bg-muted" },
    { name: "primary", cls: "bg-primary" },
    { name: "secondary", cls: "bg-secondary" },
    { name: "accent", cls: "bg-accent" },
    { name: "border", cls: "bg-border" },
]

const INTENT_SWATCHES: { name: string; cls: string }[] = [
    { name: "primary", cls: "bg-primary text-primary-foreground" },
    { name: "success", cls: "bg-success text-success-foreground" },
    { name: "warning", cls: "bg-warning text-warning-foreground" },
    { name: "info", cls: "bg-info text-info-foreground" },
    { name: "destructive", cls: "bg-destructive text-destructive-foreground" },
]

function Section({
    title,
    description,
    children,
}: {
    title: string
    description?: string
    children: React.ReactNode
}) {
    return (
        <section className="space-y-4">
            <div>
                <h2 className="text-lg font-semibold tracking-tight text-foreground">
                    {title}
                </h2>
                {description ? (
                    <p className="text-sm text-muted-foreground">{description}</p>
                ) : null}
            </div>
            <div className="rounded-xl border bg-card p-6">{children}</div>
        </section>
    )
}

export default function UiCatalogPage() {
    const [dark, setDark] = React.useState(false)

    React.useEffect(() => {
        document.documentElement.classList.toggle("dark", dark)
        return () => document.documentElement.classList.remove("dark")
    }, [dark])

    return (
        <TooltipProvider>
            <div className="min-h-screen bg-background">
                <div className="mx-auto max-w-5xl px-6 py-10">
                    <PageHeader
                        title="ScholarMind UI"
                        description="The design system: tokens and primitives, in light and dark."
                        actions={
                            <div className="flex items-center gap-2">
                                <span className="text-sm text-muted-foreground">Dark</span>
                                <Switch checked={dark} onCheckedChange={setDark} aria-label="Toggle dark mode" />
                            </div>
                        }
                    />

                    <div className="space-y-10">
                        <Section title="Color tokens" description="Semantic surfaces & the teal brand.">
                            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                                {TOKEN_SWATCHES.map((t) => (
                                    <div key={t.name} className="overflow-hidden rounded-lg border">
                                        <div className={`h-14 ${t.cls}`} />
                                        <div className="px-2 py-1.5 text-xs text-muted-foreground">
                                            {t.name}
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div className="mt-4 flex flex-wrap gap-2">
                                {INTENT_SWATCHES.map((i) => (
                                    <div
                                        key={i.name}
                                        className={`flex h-10 items-center rounded-md px-3 text-xs font-medium ${i.cls}`}
                                    >
                                        {i.name}
                                    </div>
                                ))}
                            </div>
                        </Section>

                        <Section title="Typography">
                            <div className="space-y-2">
                                <h1 className="text-3xl font-semibold tracking-tight">Display heading</h1>
                                <h2 className="text-xl font-semibold tracking-tight">Section heading</h2>
                                <p className="text-base text-foreground">
                                    Body text in Inter — the quick brown fox jumps over the lazy dog.
                                </p>
                                <p className="text-sm text-muted-foreground">
                                    Muted secondary text for hints and metadata.
                                </p>
                                <p className="font-mono text-sm tabular-nums">₹ 1,234,567.00</p>
                            </div>
                        </Section>

                        <Section title="Buttons">
                            <div className="flex flex-wrap items-center gap-3">
                                <Button>Primary</Button>
                                <Button variant="secondary">Secondary</Button>
                                <Button variant="outline">Outline</Button>
                                <Button variant="ghost">Ghost</Button>
                                <Button variant="destructive">Destructive</Button>
                                <Button variant="link">Link</Button>
                                <Button size="sm">Small</Button>
                                <Button size="lg">Large</Button>
                                <Button disabled>Disabled</Button>
                                <Button size="icon" aria-label="Add">
                                    <Plus className="size-4" />
                                </Button>
                            </div>
                        </Section>

                        <Section title="Badges & statuses">
                            <div className="flex flex-wrap items-center gap-2">
                                <Badge>Default</Badge>
                                <Badge variant="secondary">Secondary</Badge>
                                <Badge variant="outline">Outline</Badge>
                                <Badge variant="success">Success</Badge>
                                <Badge variant="warning">Warning</Badge>
                                <Badge variant="info">Info</Badge>
                                <Badge variant="destructive">Destructive</Badge>
                            </div>
                            <div className="mt-4 flex flex-wrap items-center gap-2">
                                {["ACTIVE", "PENDING", "PARTIAL", "OVERDUE", "NEW", "REJECTED"].map(
                                    (s) => (
                                        <StatusBadge key={s} status={s} />
                                    )
                                )}
                            </div>
                        </Section>

                        <Section title="Metrics">
                            <div className="grid gap-4 sm:grid-cols-3">
                                <MetricCard
                                    label="Students"
                                    value="1,284"
                                    delta="+4.2%"
                                    icon={<Users />}
                                    hint="vs last term"
                                />
                                <MetricCard
                                    label="Fees collected"
                                    value="₹ 42.6L"
                                    delta="+12%"
                                    icon={<CreditCard />}
                                    hint="this month"
                                />
                                <MetricCard
                                    label="Overdue"
                                    value="₹ 3.1L"
                                    delta="-8%"
                                    deltaIntent="down"
                                    icon={<Bell />}
                                    hint="42 invoices"
                                />
                            </div>
                        </Section>

                        <Section title="Alerts">
                            <div className="space-y-3">
                                <Alert variant="info">
                                    <GraduationCap />
                                    <AlertTitle>New academic year</AlertTitle>
                                    <AlertDescription>
                                        Term 1 for 2026-2027 opens next week.
                                    </AlertDescription>
                                </Alert>
                                <Alert variant="success">
                                    <AlertTitle>Payment received</AlertTitle>
                                    <AlertDescription>Invoice INV-2025-0007 is now paid.</AlertDescription>
                                </Alert>
                                <Alert variant="warning">
                                    <AlertTitle>3 fees overdue</AlertTitle>
                                    <AlertDescription>Send reminders from the Fees tab.</AlertDescription>
                                </Alert>
                                <Alert variant="destructive">
                                    <AlertTitle>Sync failed</AlertTitle>
                                    <AlertDescription>The last import did not complete.</AlertDescription>
                                </Alert>
                            </div>
                        </Section>

                        <Section title="Forms">
                            <div className="grid max-w-lg gap-4">
                                <FormField label="School code" hint="Ask your administrator for the code.">
                                    <Input placeholder="GREENWOOD" />
                                </FormField>
                                <FormField label="Email" required error="Enter a valid email address.">
                                    <Input type="email" placeholder="you@school.edu" />
                                </FormField>
                                <FormField label="Grade">
                                    <Select>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select a grade" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="1">Grade 1</SelectItem>
                                            <SelectItem value="2">Grade 2</SelectItem>
                                            <SelectItem value="3">Grade 3</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </FormField>
                                <FormField label="Notes">
                                    <Textarea placeholder="Anything the office should know…" />
                                </FormField>
                                <div className="flex items-center gap-6">
                                    <label className="flex items-center gap-2 text-sm">
                                        <Checkbox /> Remember me
                                    </label>
                                    <label className="flex items-center gap-2 text-sm">
                                        <Switch /> Email alerts
                                    </label>
                                </div>
                            </div>
                        </Section>

                        <Section title="Tabs & accordion">
                            <Tabs defaultValue="overview">
                                <TabsList>
                                    <TabsTrigger value="overview">Overview</TabsTrigger>
                                    <TabsTrigger value="fees">Fees</TabsTrigger>
                                    <TabsTrigger value="attendance">Attendance</TabsTrigger>
                                </TabsList>
                                <TabsContent value="overview" className="pt-4 text-sm text-muted-foreground">
                                    A summary of the section lives here.
                                </TabsContent>
                                <TabsContent value="fees" className="pt-4 text-sm text-muted-foreground">
                                    Fee plans and invoices.
                                </TabsContent>
                                <TabsContent value="attendance" className="pt-4 text-sm text-muted-foreground">
                                    Daily attendance records.
                                </TabsContent>
                            </Tabs>
                            <Accordion type="single" collapsible className="mt-4">
                                <AccordionItem value="a">
                                    <AccordionTrigger>What is a fee plan?</AccordionTrigger>
                                    <AccordionContent className="text-muted-foreground">
                                        A reusable set of fee components applied to a class or student.
                                    </AccordionContent>
                                </AccordionItem>
                                <AccordionItem value="b">
                                    <AccordionTrigger>How is tenant data isolated?</AccordionTrigger>
                                    <AccordionContent className="text-muted-foreground">
                                        Postgres row-level security, forced on every tenant-scoped table.
                                    </AccordionContent>
                                </AccordionItem>
                            </Accordion>
                        </Section>

                        <Section title="Table">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Student</TableHead>
                                        <TableHead>Class</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="text-right">Due</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {[
                                        ["Aarav Sharma", "Grade 1-A", "PAID", "₹ 0"],
                                        ["Diya Verma", "Grade 2-B", "OVERDUE", "₹ 15,000"],
                                        ["Vivaan Gupta", "Grade 1-A", "PARTIAL", "₹ 7,500"],
                                    ].map(([name, klass, status, due]) => (
                                        <TableRow key={name}>
                                            <TableCell className="font-medium">{name}</TableCell>
                                            <TableCell className="text-muted-foreground">{klass}</TableCell>
                                            <TableCell>
                                                <StatusBadge status={status} />
                                            </TableCell>
                                            <TableCell className="text-right tabular-nums">{due}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </Section>

                        <Section title="Overlays & feedback">
                            <div className="flex flex-wrap items-center gap-3">
                                <Dialog>
                                    <DialogTrigger asChild>
                                        <Button variant="outline">Open dialog</Button>
                                    </DialogTrigger>
                                    <DialogContent>
                                        <DialogHeader>
                                            <DialogTitle>Send payment reminder?</DialogTitle>
                                            <DialogDescription>
                                                This emails the guardian on file for the overdue invoice.
                                            </DialogDescription>
                                        </DialogHeader>
                                        <DialogFooter>
                                            <Button variant="ghost">Cancel</Button>
                                            <Button>Send reminder</Button>
                                        </DialogFooter>
                                    </DialogContent>
                                </Dialog>

                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="outline" size="icon" aria-label="Actions">
                                            <MoreHorizontal className="size-4" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="start">
                                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem>View student</DropdownMenuItem>
                                        <DropdownMenuItem>Send reminder</DropdownMenuItem>
                                        <DropdownMenuItem className="text-destructive">
                                            Delete
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>

                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button variant="ghost">Hover me</Button>
                                    </TooltipTrigger>
                                    <TooltipContent>A tooltip, themed to the tokens.</TooltipContent>
                                </Tooltip>

                                <Button
                                    variant="secondary"
                                    onClick={() =>
                                        toast.success("Reminder sent", {
                                            description: "The guardian was notified.",
                                        })
                                    }
                                >
                                    Trigger toast
                                </Button>
                            </div>
                        </Section>

                        <Section title="States">
                            <div className="grid gap-4 md:grid-cols-2">
                                <EmptyState
                                    icon={<Users />}
                                    title="No students yet"
                                    description="Add your first student to get started."
                                    action={<Button size="sm"><Plus className="size-4" /> Add student</Button>}
                                />
                                <div className="space-y-4">
                                    <LoadingState rows={2} />
                                    <div className="space-y-2">
                                        <Skeleton className="h-8 w-full" />
                                        <Skeleton className="h-8 w-4/5" />
                                    </div>
                                </div>
                            </div>
                        </Section>

                        <Card>
                            <CardHeader>
                                <CardTitle>Card</CardTitle>
                                <CardDescription>The container primitive everything sits in.</CardDescription>
                            </CardHeader>
                            <CardContent className="text-sm text-muted-foreground">
                                Cards use the <code>--card</code> surface and a subtle border + shadow.
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>
        </TooltipProvider>
    )
}

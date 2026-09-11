import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  getHostFamiliesAction,
  getInternationalPlacementsAction,
  getInternationalSetupOptionsAction,
  getStudentVisasAction,
} from "@/lib/actions/international";
import { InternationalForms } from "./InternationalForms";

export default async function InternationalDashboard() {
  const [visas, families, placements, options] = await Promise.all([
    getStudentVisasAction(),
    getHostFamiliesAction(),
    getInternationalPlacementsAction(),
    getInternationalSetupOptionsAction(),
  ]);

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-8">
      <div>
        <h1 className="mb-2 text-3xl font-bold text-foreground">
          International Operations & Visas
        </h1>
        <p className="text-muted-foreground">
          Secure visa compliance, homestay registration, and tenant-bound
          international placements.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <Card className="border border-blue-200 bg-blue-50/50 shadow-sm">
          <CardHeader>
            <CardTitle className="text-xl">🛂 Visa Compliance</CardTitle>
            <CardDescription>
              Track masked passport and visa expiry records.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {visas.length} Visa Records
            </div>
          </CardContent>
        </Card>
        <Card className="border border-border shadow-sm">
          <CardHeader>
            <CardTitle className="text-xl">🏠 Host Families</CardTitle>
            <CardDescription>
              Manage vetted homestay provider contacts.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">
              {families.length} Registered
            </div>
          </CardContent>
        </Card>
        <Card className="border border-border shadow-sm">
          <CardHeader>
            <CardTitle className="text-xl">🌍 Placements</CardTitle>
            <CardDescription>
              Coordinate student and host-family assignments.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">
              {placements.length} Placements
            </div>
          </CardContent>
        </Card>
      </div>

      <InternationalForms
        students={options.students}
        families={options.families}
      />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <Card className="border border-border shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Visa Compliance Tracker</CardTitle>
            <CardDescription>
              Only masked passport identifiers are shown.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-muted text-xs font-semibold uppercase text-muted-foreground">
                  <tr>
                    <th className="px-6 py-3">Student</th>
                    <th className="px-6 py-3">Visa Type</th>
                    <th className="px-6 py-3">Passport</th>
                    <th className="px-6 py-3">Expires</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {visas.length === 0 ? (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-6 py-8 text-center text-muted-foreground"
                      >
                        No student visas tracked.
                      </td>
                    </tr>
                  ) : (
                    visas.map(
                      (visa: {
                        id: string;
                        studentName: string;
                        visaType: string;
                        passportNumber: string;
                        expirationDate: string | Date;
                      }) => (
                        <tr key={visa.id} className="hover:bg-muted">
                          <td className="px-6 py-4 font-semibold">
                            {visa.studentName}
                          </td>
                          <td className="px-6 py-4">
                            <Badge variant="outline">{visa.visaType}</Badge>
                          </td>
                          <td className="px-6 py-4 font-mono text-xs">
                            {visa.passportNumber}
                          </td>
                          <td className="px-6 py-4 text-xs text-muted-foreground">
                            {new Date(visa.expirationDate).toLocaleDateString()}
                          </td>
                        </tr>
                      ),
                    )
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-border shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Host Family Registry</CardTitle>
            <CardDescription>
              Background-check and contact status.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-muted text-xs font-semibold uppercase text-muted-foreground">
                  <tr>
                    <th className="px-6 py-3">Family</th>
                    <th className="px-6 py-3">Address</th>
                    <th className="px-6 py-3">Phone</th>
                    <th className="px-6 py-3">Check</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {families.length === 0 ? (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-6 py-8 text-center text-muted-foreground"
                      >
                        No host families registered.
                      </td>
                    </tr>
                  ) : (
                    families.map(
                      (family: {
                        id: string;
                        familyName: string;
                        address: string;
                        phone: string | null;
                        backgroundChecked: string | Date | null;
                      }) => (
                        <tr key={family.id} className="hover:bg-muted">
                          <td className="px-6 py-4 font-semibold">
                            {family.familyName}
                          </td>
                          <td className="px-6 py-4 text-xs text-muted-foreground">
                            {family.address}
                          </td>
                          <td className="px-6 py-4 font-mono text-xs">
                            {family.phone || "Unavailable"}
                          </td>
                          <td className="px-6 py-4 text-xs">
                            {family.backgroundChecked ? (
                              <Badge className="border-0 bg-green-100 text-green-800">
                                Passed{" "}
                                {new Date(
                                  family.backgroundChecked,
                                ).toLocaleDateString()}
                              </Badge>
                            ) : (
                              <Badge className="border-0 bg-amber-100 text-amber-800">
                                Pending
                              </Badge>
                            )}
                          </td>
                        </tr>
                      ),
                    )
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border border-border shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">International Placements</CardTitle>
          <CardDescription>
            Student assignments are validated against this tenant before
            creation.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-muted text-xs font-semibold uppercase text-muted-foreground">
                <tr>
                  <th className="px-6 py-3">Student</th>
                  <th className="px-6 py-3">Host Family</th>
                  <th className="px-6 py-3">Placement Year</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {placements.length === 0 ? (
                  <tr>
                    <td
                      colSpan={3}
                      className="px-6 py-8 text-center text-muted-foreground"
                    >
                      No international placements created.
                    </td>
                  </tr>
                ) : (
                  placements.map(
                    (placement: {
                      id: string;
                      studentName: string;
                      hostFamilyName: string | null;
                      placementYear: number | string;
                    }) => (
                      <tr key={placement.id} className="hover:bg-muted">
                        <td className="px-6 py-4 font-semibold">
                          {placement.studentName}
                        </td>
                        <td className="px-6 py-4">
                          {placement.hostFamilyName || "Unassigned"}
                        </td>
                        <td className="px-6 py-4">
                          <Badge variant="outline">
                            {placement.placementYear}
                          </Badge>
                        </td>
                      </tr>
                    ),
                  )
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="text-base">Phase 4 Foundation Scope</CardTitle>
          <CardDescription>
            This release covers visa, encrypted passport, host-family, and
            placement operations. Multi-currency, curriculum mapping, global
            accreditation, and humanitarian workflows remain planned
            capabilities.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}

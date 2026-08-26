/**
 * Rendered whenever the signed-in student account does not resolve to a student
 * record (`students.user_id` is unset for every row in the tenant).
 *
 * This is a real, common state today: nothing in the product writes
 * `students.user_id` yet, so most student logins land here. Saying so is the
 * only honest option — the alternative would be showing someone else's
 * attendance or a fabricated one.
 */
export function AccountNotLinked({ what }: { what: string }) {
    return (
        <div className="mx-auto max-w-xl rounded-xl border border-amber-200 bg-amber-50 px-6 py-8 text-center">
            <h2 className="text-lg font-semibold text-amber-900">Your account isn&apos;t linked to a student record</h2>
            <p className="mt-2 text-sm text-amber-800">
                We can&apos;t show your {what} because this login is not yet connected to a student
                in your school&apos;s records. Ask your school office to link your account, then
                sign in again.
            </p>
        </div>
    );
}

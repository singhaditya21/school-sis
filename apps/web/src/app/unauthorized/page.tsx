export default function UnauthorizedPage() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 via-white to-orange-50">
            <div className="text-center space-y-4">
                <h1 className="text-6xl font-bold text-red-500">403</h1>
                <h2 className="text-2xl font-semibold">Unauthorized</h2>
                <p className="text-muted-foreground">
                    You don't have permission to access this page.
                </p>
                <a
                    href="/login"
                    className="inline-block mt-4 px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/90"
                >
                    Go to Login
                </a>
            </div>
        </div>
    );
}

export default function Home() {
    return (
        <main className="flex min-h-screen flex-col items-center justify-center p-24">
            <h1 className="text-4xl font-bold">Auto Inspection PWA</h1>
            <p className="mt-4 text-xl text-center text-gray-600">
                Professional vehicle appraisal tool. Fast, reliable, and persistent.
            </p>
            <div className="mt-8">
                <button className="px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors">
                    Start New Inspection
                </button>
            </div>
        </main>
    );
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white text-[#0A0A0A] pt-28 pb-16">
      <div className="max-w-4xl mx-auto px-6 space-y-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
          Privacy
        </p>
        <h1 className="text-4xl font-bold tracking-tight">Privacy Policy</h1>
        <p className="text-gray-600 leading-relaxed">
          We respect your data and only use it to provide and improve the WRK Copilot service. Data is
          encrypted in transit and at rest, and access is limited by role.
        </p>
        <div className="space-y-4 text-sm text-gray-600 leading-relaxed">
          <p>
            For questions or data requests, contact:{" "}
            <a className="text-[#E43632] hover:underline" href="mailto:privacy@wrkcopilot.com">
              privacy@wrkcopilot.com
            </a>
            .
          </p>
          <p>
            If you need signed copies of our DPA or SOC 2 report, email{" "}
            <a className="text-[#E43632] hover:underline" href="mailto:security@wrkcopilot.com">
              security@wrkcopilot.com
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  );
}


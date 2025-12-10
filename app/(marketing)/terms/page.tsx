export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white text-[#0A0A0A] pt-28 pb-16">
      <div className="max-w-4xl mx-auto px-6 space-y-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
          Terms
        </p>
        <h1 className="text-4xl font-bold tracking-tight">Terms of Service</h1>
        <p className="text-gray-600 leading-relaxed">
          These terms govern your use of WRK Copilot. By accessing the service, you agree to the
          acceptable use, confidentiality, and billing provisions outlined here.
        </p>
        <p className="text-sm text-gray-600 leading-relaxed">
          For the latest signed copy or custom terms, please contact{" "}
          <a className="text-[#E43632] hover:underline" href="mailto:legal@wrkcopilot.com">
            legal@wrkcopilot.com
          </a>
          .
        </p>
      </div>
    </div>
  );
}


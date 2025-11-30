import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50/50">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold text-[#0A0A0A]">404</h1>
        <p className="text-lg text-gray-600">Page not found</p>
        <p className="text-sm text-gray-500">The page you&apos;re looking for doesn&apos;t exist.</p>
        <Link href="/automations">
          <Button className="bg-[#E43632] hover:bg-[#C12E2A] text-white">Go to Automations</Button>
        </Link>
      </div>
    </div>
  );
}

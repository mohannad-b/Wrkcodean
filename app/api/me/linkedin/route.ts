import { NextResponse, type NextRequest } from "next/server";

import { requireUserSession } from "@/lib/api/context";

function titleCase(input: string) {
  return input
    .split(/[\s-_.]+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

export async function POST(request: NextRequest) {
  await requireUserSession(); // ensure authenticated

  const { url } = (await request.json().catch(() => ({}))) as { url?: string };
  if (!url || typeof url !== "string") {
    return NextResponse.json({ error: "LinkedIn profile URL is required." }, { status: 400 });
  }

  const trimmed = url.trim();
  if (!trimmed.includes("linkedin.com")) {
    return NextResponse.json({ error: "Please provide a valid LinkedIn profile URL." }, { status: 400 });
  }

  // Mocked extraction: use the last path segment as the slug for demo purposes.
  const slug = trimmed.split("/").filter(Boolean).slice(-1)[0] ?? "imported-user";
  const name = titleCase(slug.replace(/-/g, " "));
  const title = "Imported from LinkedIn";
  const photoUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=111827&color=fff&size=160`;

  return NextResponse.json({
    name,
    title,
    photoUrl,
  });
}

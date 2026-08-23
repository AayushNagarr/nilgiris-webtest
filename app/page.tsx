import { redirect } from "next/navigation";

// Root just hands off to the builder. Unauthenticated visitors are bounced
// to /login by middleware.ts before they ever see /builder.
export default function Home() {
  redirect("/builder");
}

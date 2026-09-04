import { redirect } from "next/navigation"
import { getCurrentSession } from "@/lib/auth"

export default async function Home() {
  const session = await getCurrentSession()
  if (session?.user?.id) {
    redirect("/editor")
  } else {
    redirect("/sign-in")
  }
}

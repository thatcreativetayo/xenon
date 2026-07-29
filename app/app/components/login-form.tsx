"use client";

import Image from "next/image";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

const API_URL = "/api";

function getErrorMessage(response: Response, body: unknown) {
  if (typeof body === "object" && body !== null && "error" in body) {
    const error = body.error;
    if (typeof error === "string") return error;
    if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string") return error.message;
  }
  return response.status === 429 ? "Too many requests, try later" : "Something went wrong. Please try again.";
}

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsLoading(true);
    try {
      const response = await fetch(`${API_URL}/auth/email/request-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: email.trim() }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setError(getErrorMessage(response, body));
        return;
      }
      router.push(`/login/verify?email=${encodeURIComponent(email.trim())}`);
    } catch {
      setError("We couldn't reach Xenon. Check your connection and try again.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-5 py-10 text-dark dark:bg-[#1A1A1A] dark:text-[#F9F7F6]">
      <Image src="/logo.svg" alt="Xenon" width={1000} height={1000} className="mb-8 h-auto w-25" priority />
      <div className="flex flex-col items-center">
        <h1 className="text-center text-[32px] font-bold">Welcome to Xenon.</h1>
        <p className="mx-auto mt-2 w-full max-w-sm text-center font-medium opacity-50">Sign in to test endpoints, transform payloads, and inspect data.</p>
      </div>
      <form onSubmit={handleSubmit} className="mt-6 flex w-full max-w-sm flex-col gap-3">
        <label htmlFor="email" className="sr-only">Email address</label>
        <input id="email" type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Enter your email address..." className="rounded-[14px] border border-base/20 bg-white p-2.5 px-3.5 font-medium text-dark outline-0 shadow shadow-dark/3 placeholder:text-dark/30 focus:ring focus:ring-base/60 dark:border-white/15 dark:bg-white/10 dark:text-white dark:placeholder:text-white/35" />
        {error && <p className="text-sm font-semibold text-red-600 dark:text-red-400" role="alert">{error}</p>}
        <button type="submit" disabled={isLoading} className="relative w-full cursor-pointer overflow-hidden rounded-[14px] bg-base py-2.5 text-center font-bold text-white shadow-xl shadow-base/20 ring-4 ring-[#81623F]/20 transition-all duration-300 hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"><span className="relative z-10">{isLoading ? "Sending codeâ€¦" : "Continue"}</span></button>
        <div className="my-2 flex items-center gap-3 text-xs font-bold opacity-40"><span className="h-px flex-1 bg-current" /><span>OR</span><span className="h-px flex-1 bg-current" /></div>
        <a href={`${API_URL}/auth/google`} className="flex w-full items-center justify-center gap-2 rounded-[14px] border border-dark/15 bg-white py-2.5 font-bold text-dark transition-colors hover:bg-dark/5 dark:border-white/20 dark:bg-white/10 dark:text-white dark:hover:bg-white/15"><span aria-hidden="true" className="text-lg">G</span>Continue with Google</a>
      </form>
    </main>
  );
}


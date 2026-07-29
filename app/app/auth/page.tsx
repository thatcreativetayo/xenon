"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

const API_BASE_URL = "/api/xenon";
const BACKEND_URL = (process.env.NEXT_PUBLIC_XENON_API_URL ?? "http://localhost:4001").replace(/\/$/, "");

async function getErrorMessage(response: Response, fallback: string) {
  try {
    const body = (await response.json()) as {
      error?: { message?: string } | string;
      message?: string;
    };

    if (typeof body.error === "string") return body.error;
    if (body.error?.message) return body.error.message;
    if (body.message) return body.message;
  } catch {}

  return fallback;
}

function GoogleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5">
      <path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3Z" />
      <path fill="#34A853" d="M12 22c2.7 0 5-.9 6.6-2.5L15.4 17c-.9.6-2 1-3.4 1a5.8 5.8 0 0 1-5.4-4H3.3v2.6A10 10 0 0 0 12 22Z" />
      <path fill="#FBBC05" d="M6.6 14a6 6 0 0 1 0-3.9V7.5H3.3a10 10 0 0 0 0 9.1L6.6 14Z" />
      <path fill="#EA4335" d="M12 6c1.5 0 2.8.5 3.8 1.5l2.9-2.8A9.7 9.7 0 0 0 3.3 7.5l3.3 2.6A5.8 5.8 0 0 1 12 6Z" />
    </svg>
  );
}

export default function AuthPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail) {
      setError("Enter your email address to continue.");
      return;
    }

    setError("");
    setIsSubmitting(true);

    try {
      const response = await fetch(`${API_BASE_URL}/auth/email/request-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail }),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, "We couldn't send a code. Try again."));
      }

      router.push(`/login/verify?email=${encodeURIComponent(normalizedEmail)}`);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "We couldn't send a code. Try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5 py-12 text-dark">
      <div className="flex w-full max-w-sm flex-col items-center">
        <Image
          src="/logo.svg"
          alt="Xenon"
          width={160}
          height={50}
          className="mb-8 h-auto w-25"
          priority
        />

        <div className="text-center">
          <h1 className="text-[32px] font-bold leading-tight tracking-[-1.5px]">
            Welcome to the JSON sandbox.
          </h1>
          <p className="mx-auto mt-1.5 max-w-sm font-medium text-dark/50">
            Test endpoints, transform payloads, and inspect data using simple visual forms.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 flex w-full flex-col gap-3">
          <label htmlFor="email" className="sr-only">
            Email address
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              if (error) setError("");
            }}
            placeholder="Enter your email address..."
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "email-error" : undefined}
            className="rounded-[14px] border border-base/20 bg-white px-3.5 py-2.5 font-medium text-dark outline-0 shadow shadow-dark/3 placeholder:text-dark/30 focus:ring focus:ring-base/60"
          />
          {error && (
            <p id="email-error" role="alert" className="-mt-1 text-sm font-semibold text-red-600">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-[14px] bg-base py-2.5 text-center font-bold text-white shadow-xl shadow-base/20 ring-4 ring-base/20 transition-all duration-300 hover:scale-[1.01] disabled:cursor-wait disabled:opacity-70"
          >
            {isSubmitting ? "Sending..." : "Continue"}
          </button>
        </form>

        <div className="my-7 flex w-full items-center gap-2 text-xs font-bold text-base/80">
          <span className="h-px flex-1 bg-base/15" />
          <span>OR</span>
          <span className="h-px flex-1 bg-base/15" />
        </div>

        <a
          href={`${BACKEND_URL}/auth/google`}
          className="flex w-full items-center justify-center gap-2 rounded-[14px] border border-base/10 bg-white py-2.5 font-semibold text-base shadow shadow-dark/3 transition hover:border-base/25 hover:bg-base/5"
        >
          <GoogleIcon />
          Continue with Google
        </a>
      </div>
    </main>
  );
}

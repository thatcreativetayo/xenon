"use client";

import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import {
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
  Suspense,
  useEffect,
  useRef,
  useState,
} from "react";

const API_BASE_URL = "/api/xenon";
const CODE_LENGTH = 6;

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

function VerifyForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get("email")?.trim().toLowerCase() ?? "";
  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(""));
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(30);
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    if (!email) router.replace("/auth");
  }, [email, router]);

  useEffect(() => {
    if (secondsLeft <= 0) return;

    const timer = window.setInterval(() => {
      setSecondsLeft((current) => Math.max(0, current - 1));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [secondsLeft]);

  function updateDigits(nextDigits: string[]) {
    setDigits(nextDigits);
    if (error) setError("");
  }

  function fillFromValue(value: string, startIndex = 0) {
    const cleanValue = value.replace(/\D/g, "").slice(0, CODE_LENGTH - startIndex);
    if (!cleanValue) return;

    const nextDigits = [...digits];
    cleanValue.split("").forEach((digit, offset) => {
      nextDigits[startIndex + offset] = digit;
    });
    updateDigits(nextDigits);

    const nextEmptyIndex = nextDigits.findIndex((digit) => !digit);
    const focusIndex = nextEmptyIndex === -1 ? CODE_LENGTH - 1 : nextEmptyIndex;
    inputRefs.current[focusIndex]?.focus();
  }

  function handleChange(index: number, value: string) {
    if (value.length > 1) {
      fillFromValue(value, index);
      return;
    }

    const nextDigits = [...digits];
    nextDigits[index] = value.replace(/\D/g, "");
    updateDigits(nextDigits);

    if (nextDigits[index] && index < CODE_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handleKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
    if (event.key === "ArrowLeft" && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
    if (event.key === "ArrowRight" && index < CODE_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handlePaste(index: number, event: ClipboardEvent<HTMLInputElement>) {
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "");
    if (!pasted) return;

    event.preventDefault();
    fillFromValue(pasted, index);
  }

  async function handleVerify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = digits.join("");
    if (!email || code.length !== CODE_LENGTH) return;

    setError("");
    setIsSubmitting(true);

    try {
      const response = await fetch(`${API_BASE_URL}/auth/email/verify-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, "That code is not valid. Try again."));
      }

      router.push("/dashboard");
    } catch (requestError) {
      setDigits(Array(CODE_LENGTH).fill(""));
      inputRefs.current[0]?.focus();
      setError(
        requestError instanceof Error
          ? requestError.message
          : "That code is not valid. Try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResend() {
    if (!email || secondsLeft > 0 || isResending) return;

    setError("");
    setIsResending(true);

    try {
      const response = await fetch(`${API_BASE_URL}/auth/email/request-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, "We couldn't resend the code. Try again."));
      }

      setSecondsLeft(30);
      setDigits(Array(CODE_LENGTH).fill(""));
      inputRefs.current[0]?.focus();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "We couldn't resend the code. Try again.",
      );
    } finally {
      setIsResending(false);
    }
  }

  if (!email) return null;

  const isComplete = digits.every(Boolean);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5 py-12 text-dark">
      <div className="flex w-full max-w-sm flex-col items-center text-center">
         <Image
          src="/logo.svg"
          alt="Xenon"
          width={160}
          height={50}
          className="mb-8 h-auto w-25"
          priority
        />

        <h1 className="text-[28px] font-bold leading-tight tracking-[-1.5px]">
          Enter your code.
        </h1>
        <p className="mt-2 text-[15px] font-medium text-dark/50">
          We sent a code to <span className="break-all text-dark/70">{email}</span>
        </p>

        <form onSubmit={handleVerify} className="mt-7 w-full">
          <div className="flex justify-center gap-2">
            {digits.map((digit, index) => (
              <input
                key={index}
                ref={(element) => {
                  inputRefs.current[index] = element;
                }}
                type="text"
                inputMode="numeric"
                autoComplete={index === 0 ? "one-time-code" : "off"}
                maxLength={1}
                value={digit}
                aria-label={`Digit ${index + 1}`}
                onChange={(event) => handleChange(index, event.target.value)}
                onKeyDown={(event) => handleKeyDown(index, event)}
                onPaste={(event) => handlePaste(index, event)}
                className="h-12 w-12 rounded-[14px] border border-base/20 bg-white text-center text-xl font-bold text-dark outline-0 shadow shadow-dark/3 focus:ring focus:ring-base/60"
              />
            ))}
          </div>

          {error && (
            <p role="alert" className="mt-3 text-sm font-semibold text-red-600">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={!isComplete || isSubmitting}
            className="mt-5 w-[21rem] rounded-[14px] bg-base py-2.5 font-bold text-white shadow-xl shadow-base/20 ring-4 ring-[#81623F]/20 transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? "Verifying..." : "Continue"}
          </button>
        </form>

        <button
          type="button"
          onClick={handleResend}
          disabled={secondsLeft > 0 || isResending}
          className="mt-5 text-sm font-semibold text-base underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:no-underline disabled:opacity-50"
        >
          {isResending
            ? "Sending..."
            : secondsLeft > 0
              ? `Resend code in ${secondsLeft}s`
              : "Resend code"}
        </button>

        <a
          href="/auth"
          className="mt-4 text-sm font-semibold text-base/70 underline-offset-4 hover:underline"
        >
          Use a different email
        </a>
      </div>
    </main>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-background" />}>
      <VerifyForm />
    </Suspense>
  );
}

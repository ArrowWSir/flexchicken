"use client";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CircleAlert, Stamp } from "lucide-react";
import { loadCustomer } from "../lib/card";
import { browserEnv } from "../lib/browserEnv";
import { getRepo } from "../lib/store";
import ReviewPrompt from "./ReviewPrompt";

// Taking the code out of the address once it is used means a refresh, or a
// screenshot of the page, does not show "already collected".
function forgetToken() {
  try {
    window.history.replaceState(null, "", "/stamp");
  } catch {
    // Old browsers: the page still works, a refresh just says "collected".
  }
}

function useReceiptStamp(token) {
  const [claim, setClaim] = useState({ status: "claiming", orderNumber: null, message: "" });
  // React runs effects twice in development; one code, one attempt.
  const triedFor = useRef(null);

  useEffect(() => {
    if (triedFor.current === token) return;
    triedFor.current = token;
    if (!token) {
      setClaim({ status: "error", orderNumber: null, message: "This link has no stamp code. Ask at the counter and we'll stamp your card." });
      return;
    }
    const claimStamp = async () => {
      try {
        const repo = getRepo();
        const { id } = loadCustomer(browserEnv());
        await repo.registerCard({ id });
        const { orderNumber } = await repo.redeemStampToken(token, id);
        setClaim({ status: "stamped", orderNumber, message: "" });
        forgetToken();
      } catch (err) {
        setClaim({ status: "error", orderNumber: null, message: err.message || "We couldn't add your stamp. Ask at the counter." });
      }
    };
    claimStamp();
  }, [token]);

  return claim;
}

export default function StampClaim() {
  // Read once: forgetToken() then clears the address, which must not count
  // as a second visit with no code.
  const params = useSearchParams();
  const [token] = useState(() => params.get("t"));
  const claim = useReceiptStamp(token);

  return (
    <div className="mx-auto mt-5 grid w-full max-w-[440px] gap-4 pb-10 [&>*]:min-w-0">
      <div role="status" aria-live="polite">
        {claim.status === "stamped" && (
          <p className="flex items-center gap-3 rounded-[18px] bg-go px-4 py-3 text-[14px] font-semibold text-white shadow-paper">
            <span className="stamp-thud flex size-9 shrink-0 -rotate-12 items-center justify-center rounded-full border-2 border-white/80">
              <Stamp className="size-[18px]" strokeWidth={2.4} aria-hidden="true" />
            </span>
            <span>
              Stamp added{claim.orderNumber ? ` from receipt ${claim.orderNumber}` : ""}.
              <span className="block text-[12.5px] font-medium text-white/85">It's on your Flex card above.</span>
            </span>
          </p>
        )}
        {claim.status === "error" && (
          <p className="flex gap-3 rounded-[18px] bg-ground-raised px-4 py-3 text-[14px] leading-snug text-ink shadow-paper ring-1 ring-line">
            <CircleAlert className="mt-0.5 size-5 shrink-0 text-flex-ink" aria-hidden="true" />
            {claim.message}
          </p>
        )}
      </div>

      {claim.status !== "claiming" && <ReviewPrompt orderNumber={claim.orderNumber} />}
    </div>
  );
}

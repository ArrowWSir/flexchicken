import { BRAND } from "../lib/brand";

// Shown until the owner supplies the real text (PLAN.md, Q7).
export default function LegalPlaceholder({ title }) {
  return (
    <main className="page-frame">
      <div className="page-gutter mx-auto max-w-[620px] py-16">
        <a href="/" className="text-[13px] font-semibold text-flex-ink underline-offset-4 hover:underline">
          ← Back to Flex Chicken
        </a>
        <h1 className="mt-6 font-display text-[34px] font-black uppercase leading-none">{title}</h1>
        <p className="mt-4 text-[15px] leading-relaxed text-muted">
          This page is being written. For anything you need in the meantime, call us on{" "}
          <a href={BRAND.phone.href} className="font-semibold text-ink underline underline-offset-2">
            {BRAND.phone.label}
          </a>{" "}
          or email{" "}
          <a href={`mailto:${BRAND.email}`} className="font-semibold text-ink underline underline-offset-2">
            {BRAND.email}
          </a>
          .
        </p>
      </div>
    </main>
  );
}

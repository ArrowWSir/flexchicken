import { Download } from "lucide-react";
import { BRAND } from "../../lib/brand";

/**
 * "Download menu": the owner's PDF when there is one, otherwise the printable
 * menu page, which saves as a PDF from the browser.
 */
export default function MenuDownload({ className = "", label = "Download menu" }) {
  const pdf = BRAND.menuPdf;
  return (
    <a href={pdf ?? "/full-menu"} {...(pdf ? { download: "Flex Chicken menu.pdf" } : {})} className={className}>
      <Download className="size-4 shrink-0" strokeWidth={2.2} aria-hidden="true" />
      {label}
      {pdf && <span className="sr-only"> (PDF)</span>}
    </a>
  );
}

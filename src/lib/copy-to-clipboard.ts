import { toast } from "sonner";

export async function copyToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through to execCommand fallback
    }
  }

  // Fallback using a hidden temporary textarea + execCommand("copy").
  // This works in embedded preview iframes and older Safari/iOS versions where
  // the async Clipboard API is blocked or unavailable.
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  try {
    const success = document.execCommand("copy");
    document.body.removeChild(textarea);
    return success;
  } catch {
    document.body.removeChild(textarea);
    return false;
  }
}

export function copyLinkWithToast(text: string, successTitle: string) {
  void copyToClipboard(text).then((success) => {
    if (success) {
      toast.success(successTitle, { description: text });
    } else {
      toast.message("Copy this link", { description: text });
    }
  });
}

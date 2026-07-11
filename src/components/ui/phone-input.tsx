import * as React from "react";
import { Input } from "@/components/ui/input";
import { formatPhone } from "@/lib/format-phone";

type Base = Omit<
  React.ComponentProps<typeof Input>,
  "onChange" | "type" | "inputMode" | "autoComplete"
>;

export interface PhoneInputProps extends Base {
  value: string;
  onChange: (formatted: string) => void;
  /** Optional callback with just the raw digits (0-10 chars). */
  onDigitsChange?: (digits: string) => void;
}

/**
 * Shared masked phone input. Always progressively formats to (XXX) XXX-XXXX
 * so every phone entry point in the app collects the same shape.
 */
export const PhoneInput = React.forwardRef<HTMLInputElement, PhoneInputProps>(
  ({ value, onChange, onDigitsChange, placeholder, maxLength, ...rest }, ref) => {
    return (
      <Input
        ref={ref}
        {...rest}
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        placeholder={placeholder ?? "(555) 555-1234"}
        maxLength={maxLength ?? 14}
        value={value}
        onChange={(e) => {
          const formatted = formatPhone(e.target.value);
          onChange(formatted);
          if (onDigitsChange) onDigitsChange(formatted.replace(/\D/g, ""));
        }}
      />
    );
  },
);
PhoneInput.displayName = "PhoneInput";

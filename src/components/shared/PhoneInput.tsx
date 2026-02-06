import { Input } from '@/components/ui/input';
import { forwardRef, useState, useCallback } from 'react';
import { cn } from '@/lib/utils';

interface PhoneInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  value: string;
  onChange: (value: string) => void;
  error?: boolean;
}

/**
 * Formats a phone number to Brazilian format
 * (11) 9999-9999 for 10 digits
 * (11) 99999-9999 for 11 digits
 */
export function formatPhoneBR(value: string): string {
  // Remove non-numeric characters
  const numbers = value.replace(/\D/g, '');
  
  // Limit to 11 digits
  const limited = numbers.substring(0, 11);
  
  if (limited.length <= 2) {
    return limited.length > 0 ? `(${limited}` : '';
  }
  
  if (limited.length <= 6) {
    return `(${limited.substring(0, 2)}) ${limited.substring(2)}`;
  }
  
  if (limited.length <= 10) {
    // Format: (11) 9999-9999
    return `(${limited.substring(0, 2)}) ${limited.substring(2, 6)}-${limited.substring(6)}`;
  }
  
  // Format: (11) 99999-9999
  return `(${limited.substring(0, 2)}) ${limited.substring(2, 7)}-${limited.substring(7)}`;
}

/**
 * Validates if a phone number matches Brazilian format
 */
export function validatePhoneBR(value: string): boolean {
  if (!value) return true; // Empty is valid (optional field)
  const phoneRegex = /^\(\d{2}\)\s?\d{4,5}-\d{4}$/;
  return phoneRegex.test(value);
}

export const PhoneInput = forwardRef<HTMLInputElement, PhoneInputProps>(
  ({ value, onChange, error, className, ...props }, ref) => {
    const [focused, setFocused] = useState(false);
    
    const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
      const formatted = formatPhoneBR(e.target.value);
      onChange(formatted);
    }, [onChange]);
    
    return (
      <div className="relative">
        <Input
          ref={ref}
          type="tel"
          value={value}
          onChange={handleChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="(11) 99999-9999"
          maxLength={15}
          className={cn(
            error && 'border-red-500 focus-visible:ring-red-500',
            className
          )}
          {...props}
        />
        {focused && value && !validatePhoneBR(value) && (
          <p className="absolute -bottom-5 left-0 text-xs text-red-500">
            Formato: (11) 99999-9999
          </p>
        )}
      </div>
    );
  }
);

PhoneInput.displayName = 'PhoneInput';

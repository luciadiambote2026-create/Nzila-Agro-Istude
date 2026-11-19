import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

interface PasswordInputProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  minLength?: number;
  autoComplete?: string;
}

export const PasswordInput: React.FC<PasswordInputProps> = ({
  id,
  label,
  value,
  onChange,
  placeholder = '••••••',
  required = false,
  minLength,
  autoComplete,
}) => {
  const [visible, setVisible] = useState(false);

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-[#1C2720] mb-1.5">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          minLength={minLength}
          autoComplete={autoComplete}
          className="w-full rounded-lg border border-[#D4DDD6] bg-white px-3.5 py-2.5 pr-11 text-sm text-[#111814] placeholder:text-[#7B8B80] focus:border-[#15803D] focus:outline-none focus:ring-2 focus:ring-[#15803D]/20"
        />
        <button
          type="button"
          onClick={() => setVisible((prev) => !prev)}
          aria-label={visible ? 'Ocultar palavra-passe' : 'Mostrar palavra-passe'}
          title={visible ? 'Ocultar palavra-passe' : 'Mostrar palavra-passe'}
          className="absolute inset-y-0 right-0 flex items-center justify-center w-10 text-[#546459] hover:text-[#14532D] focus-visible:outline-none focus-visible:text-[#15803D] transition-colors"
        >
          {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
};

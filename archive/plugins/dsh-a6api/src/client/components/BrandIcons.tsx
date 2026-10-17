import React from 'react';

export const BrandIcon: React.FC<{ brand: string; modelName?: string; size?: number; className?: string }> = ({
  brand,
  modelName = '',
  size = 28,
  className = '',
}) => {
  const b = (brand || '').toLowerCase();
  const m = (modelName || '').toLowerCase();

  // OpenAI
  if (b.includes('openai') || m.startsWith('gpt') || m.startsWith('o1') || m.startsWith('o3')) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="currentColor"
        className={`dsh-a6-brand-icon openai ${className}`}
      >
        <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5153-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1683a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4947zm-9.66-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1401-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1683a.0757.0757 0 0 1-.071 0l-4.8303-2.7866A4.504 4.504 0 0 1 2.3408 7.8956zm16.0993 3.8558L12.5973 8.3829l2.02-1.1636a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.402-.6862zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1635a.0804.0804 0 0 1-.038-.0567V6.0748a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.4598a.7948.7948 0 0 0-.3927.6813v6.7219zm1.093-2.2285L12 9.172l2.6005 1.5026v3.0053L12 15.1825l-2.6005-1.5026V10.6345z" />
      </svg>
    );
  }

  // Anthropic / Claude
  if (b.includes('anthropic') || m.startsWith('claude')) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="currentColor"
        className={`dsh-a6-brand-icon claude ${className}`}
      >
        <path d="M4.5 10.5C4.5 7.186 7.186 4.5 10.5 4.5h3c3.314 0 6 2.686 6 6v3c0 3.314-2.686 6-6 6h-3c-3.314 0-6-2.686-6-6v-3z" opacity="0.2" fill="#d97706" />
        <path d="M13.5 2.5a1.5 1.5 0 0 1 1.5 1.5v4.25a.75.75 0 0 0 .75.75H20a1.5 1.5 0 0 1 1.5 1.5v3a1.5 1.5 0 0 1-1.5 1.5h-4.25a.75.75 0 0 0-.75.75V20a1.5 1.5 0 0 1-1.5 1.5h-3a1.5 1.5 0 0 1-1.5-1.5v-4.25a.75.75 0 0 0-.75-.75H4a1.5 1.5 0 0 1-1.5-1.5v-3A1.5 1.5 0 0 1 4 9h4.25a.75.75 0 0 0 .75-.75V4a1.5 1.5 0 0 1 1.5-1.5h3z" fill="#d97706" />
      </svg>
    );
  }

  // DeepSeek
  if (b.includes('deepseek') || m.startsWith('deepseek')) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="currentColor"
        className={`dsh-a6-brand-icon deepseek ${className}`}
      >
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 16.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.4z" fill="#0284c7" />
      </svg>
    );
  }

  // Google / Gemini
  if (b.includes('google') || m.startsWith('gemini')) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="currentColor"
        className={`dsh-a6-brand-icon google ${className}`}
      >
        <path d="M12 2C12 7.52 7.52 12 2 12C7.52 12 12 16.48 12 22C12 16.48 16.48 12 22 12C16.48 12 12 7.52 12 2Z" fill="#3b82f6" />
      </svg>
    );
  }

  // xAI / Grok
  if (b.includes('xai') || m.startsWith('grok')) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="currentColor"
        className={`dsh-a6-brand-icon grok ${className}`}
      >
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    );
  }

  // Moonshot / Kimi
  if (b.includes('moonshot') || m.startsWith('kimi')) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="currentColor"
        className={`dsh-a6-brand-icon moonshot ${className}`}
      >
        <circle cx="12" cy="12" r="9" fill="#6366f1" opacity="0.2" />
        <path d="M12 3a9 9 0 1 0 9 9c0-.46-.04-.92-.1-1.36a5.5 5.5 0 0 1-7.54-7.54A9.03 9.03 0 0 0 12 3z" fill="#6366f1" />
      </svg>
    );
  }

  // Alibaba / Qwen
  if (b.includes('alibaba') || m.startsWith('qwen')) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="currentColor"
        className={`dsh-a6-brand-icon qwen ${className}`}
      >
        <circle cx="12" cy="12" r="9" fill="#f97316" opacity="0.2" />
        <polygon points="12,4 19,8 19,16 12,20 5,16 5,8" fill="#f97316" />
      </svg>
    );
  }

  // Default AI Sparkle Icon
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`dsh-a6-brand-icon default ${className}`}
    >
      <path d="M12 3v3m0 12v3M3 12h3m12 0h3M6.34 6.34l2.12 2.12m7.08 7.08l2.12 2.12M6.34 17.66l2.12-2.12m7.08-7.08l2.12-2.12" stroke="#64748b" />
      <circle cx="12" cy="12" r="3" fill="#64748b" />
    </svg>
  );
};

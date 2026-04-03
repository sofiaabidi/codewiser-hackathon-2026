export default function UiIcon({ name, size = 16, className = '' }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    className,
    'aria-hidden': true,
  };

  switch (name) {
    case 'target':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="12" cy="12" r="1.5" fill="currentColor" />
        </svg>
      );
    case 'graph':
      return (
        <svg {...common}>
          <circle cx="6" cy="18" r="2" />
          <circle cx="18" cy="6" r="2" />
          <circle cx="12" cy="12" r="2" />
          <path d="M7.5 16.5l3-3M13.5 10.5l3-3M8 18h8" />
        </svg>
      );
    case 'calendar':
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M16 3v4M8 3v4M3 10h18" />
        </svg>
      );
    case 'book':
      return (
        <svg {...common}>
          <path d="M4 5a3 3 0 013-3h13v18H7a3 3 0 00-3 3z" />
          <path d="M7 2v20" />
        </svg>
      );
    case 'refresh':
      return (
        <svg {...common}>
          <path d="M21 12a9 9 0 10-3.2 6.9" />
          <path d="M21 3v6h-6" />
        </svg>
      );
    case 'repeat':
      return (
        <svg {...common}>
          <path d="M17 1l4 4-4 4" />
          <path d="M3 11V9a4 4 0 014-4h14" />
          <path d="M7 23l-4-4 4-4" />
          <path d="M21 13v2a4 4 0 01-4 4H3" />
        </svg>
      );
    case 'link':
      return (
        <svg {...common}>
          <path d="M10 13a5 5 0 007.1 0l2.8-2.8a5 5 0 00-7.1-7.1L10 4" />
          <path d="M14 11a5 5 0 00-7.1 0L4 13.8a5 5 0 107.1 7.1L14 20" />
        </svg>
      );
    case 'check':
      return (
        <svg {...common}>
          <path d="M20 6L9 17l-5-5" />
        </svg>
      );
    case 'spark':
      return (
        <svg {...common}>
          <path d="M12 3l2.3 4.7L19 10l-4.7 2.3L12 17l-2.3-4.7L5 10l4.7-2.3z" />
        </svg>
      );
    case 'edit':
      return (
        <svg {...common}>
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.1 2.1 0 113 3L7 19l-4 1 1-4z" />
        </svg>
      );
    case 'chart':
      return (
        <svg {...common}>
          <path d="M3 3v18h18" />
          <path d="M7 14l3-3 3 2 4-5" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" />
        </svg>
      );
  }
}

export function RoleIcon({ roleId, size = 20, className = '' }) {
  const nameByRole = {
    data_scientist: 'chart',
    frontend_developer: 'edit',
    backend_developer: 'graph',
    devops_engineer: 'refresh',
    ml_engineer: 'spark',
    product_manager: 'target',
  };
  return <UiIcon name={nameByRole[roleId] || 'target'} size={size} className={className} />;
}


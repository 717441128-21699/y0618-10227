import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface Crumb {
  label: string;
  to?: string;
}

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  crumbs?: Crumb[];
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, subtitle, icon, crumbs, actions, className }: PageHeaderProps) {
  return (
    <header
      className={cn(
        "flex h-14 shrink-0 items-center justify-between border-b border-ink-700/60 bg-ink-850/40 px-5",
        className
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        {icon && (
          <span className="flex h-8 w-8 items-center justify-center rounded-[4px] border border-fluor/30 bg-fluor/10 text-fluor">
            {icon}
          </span>
        )}
        <div className="min-w-0">
          {crumbs && crumbs.length > 0 && (
            <div className="mono flex items-center gap-1 text-2xs text-ink-400">
              {crumbs.map((c, i) => (
                <span key={i} className="flex items-center gap-1">
                  {c.to ? (
                    <Link to={c.to} className="hover:text-fluor">
                      {c.label}
                    </Link>
                  ) : (
                    <span>{c.label}</span>
                  )}
                  {i < crumbs.length - 1 && <ChevronRight size={11} />}
                </span>
              ))}
            </div>
          )}
          <h1 className="truncate text-sm font-semibold text-ink-50">{title}</h1>
        </div>
        {subtitle && <span className="ml-2 hidden text-xs text-ink-300 lg:block">{subtitle}</span>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}

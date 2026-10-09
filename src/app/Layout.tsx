import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslations } from 'use-intl'
import { useAuth } from '@/features/auth/useAuth'
import { Button, buttonVariants } from '@/components/ui/button'
import { ThemeToggle } from '@/components/theme-toggle'
import { UsageDataToggle } from '@/components/usage-data-toggle'

export function Layout({ children }: { children: ReactNode }) {
  const { tokens, logout } = useAuth()
  const t = useTranslations('nav')
  return (
    <>
      <a
        href="#main"
        className="sr-only rounded-md bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50"
      >
        {t('skipToContent')}
      </a>
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <Link to="/" className="text-lg font-semibold text-primary">
            madrileno
          </Link>
          <nav className="flex items-center gap-3">
            {tokens !== null ? (
              <>
                <span className="text-sm text-muted-foreground">{tokens.email}</span>
                <Button variant="ghost" size="sm" onClick={logout}>
                  {t('logOut')}
                </Button>
              </>
            ) : (
              <Link to="/login" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
                {t('logIn')}
              </Link>
            )}
            <ThemeToggle />
          </nav>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="mx-auto max-w-4xl px-4 py-8 outline-none">
        {children}
      </main>
      <footer className="mx-auto max-w-4xl px-4 pb-8">
        <UsageDataToggle />
      </footer>
    </>
  )
}
